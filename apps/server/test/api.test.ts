import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { apiKeys, bots, machines, slackConnections, tasks, vmRuns } from "@agentcall/db";
import { aad, sha256 } from "../src/lib/crypto";
import { routeToBot } from "../src/routes/slack-events";
import { claimNext } from "../src/worker/tasks";
import { fakeFetch, json, setup } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
const providers = fakeFetch(
  (url, init) => {
    if (url.hostname === "opencode.ai") {
      const auth = new Headers(init?.headers).get("authorization");
      return auth === "Bearer oc-good-key-1234" ? json({ error: "bad request" }, 400) : json({ error: "unauthorized" }, 401);
    }
  },
  (url, init) => {
    if (url.hostname === "api.instabox.sh" && url.pathname === "/v1/usage") {
      const key = new Headers(init?.headers).get("x-api-key");
      if (key !== "ibk_good_key_5678") return json({ error: { code: "unauthorized", message: "bad key" } }, 401);
      return json({
        machines: 0,
        limits: { maxMachines: 1, machineSpec: { vcpus: 4, memMiB: 8192 } },
        org: { id: "o1", name: "acme", tier: "free" },
      });
    }
  },
  (url) => (url.hostname === "slack.com" ? json({ ok: true, ts: "111.222", channels: [] }) : undefined),
);

beforeEach(async () => {
  providers.calls.length = 0;
  t = await setup(
    { SLACK_CLIENT_ID: "cid", SLACK_CLIENT_SECRET: "csec", SLACK_SIGNING_SECRET: "slack-secret", GITHUB_WEBHOOK_SECRET: "gh-secret" },
    providers.impl,
  );
});
afterEach(() => t.close());

describe("standard responses", () => {
  test("health and unknown routes", async () => {
    expect(await t.call("GET", "/health")).toEqual({ status: 200, body: { ok: true, data: { status: "healthy" } } });
    const r = await t.call("GET", "/api/v1/nope");
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ ok: false, error: { code: "not_found", message: "No such endpoint." } });
  });

  test("validation errors list issues", async () => {
    const r = await t.call("POST", "/api/v1/auth/signup", { name: "", email: "nope", password: "x" });
    expect(r.status).toBe(422);
    expect(r.body.ok).toBe(false);
    expect(r.body.error.code).toBe("validation_failed");
    expect(r.body.error.details.length).toBeGreaterThan(0);
  });

  test("unauthenticated and cross-origin requests", async () => {
    expect((await t.call("GET", "/api/v1/bots")).body.error.code).toBe("unauthorized");
    const r = await t.call("POST", "/api/v1/auth/logout", {}, { origin: "https://evil.example" });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("forbidden_origin");
  });
});

describe("auth", () => {
  test("signup, me, logout, login", async () => {
    const user = await t.signup();
    expect((await t.call("GET", "/api/v1/auth/me")).body.data.user).toMatchObject({ id: user.id, onboarded: false });
    expect((await t.call("POST", "/api/v1/auth/signup", { name: "A", email: "ADA@example.com", password: "12345678" })).body.error.code).toBe(
      "email_taken",
    );
    await t.call("POST", "/api/v1/auth/logout");
    expect((await t.call("GET", "/api/v1/auth/me")).status).toBe(401);
    expect((await t.call("POST", "/api/v1/auth/login", { email: "ada@example.com", password: "wrong" })).body.error.code).toBe(
      "invalid_credentials",
    );
    expect((await t.call("POST", "/api/v1/auth/login", { email: "ada@example.com", password: "correct horse" })).status).toBe(200);
  });
});

describe("onboarding keys", () => {
  test("OpenCode and instabox keys are verified and stored encrypted", async () => {
    const user = await t.signup();
    expect((await t.call("PUT", "/api/v1/integrations/opencode", { apiKey: "oc-bad-key-0000" })).body.error.code).toBe(
      "invalid_api_key",
    );
    expect((await t.call("PUT", "/api/v1/integrations/opencode", { apiKey: "oc-good-key-1234" })).body.data).toEqual({
      connected: true,
      last4: "1234",
    });
    const ib = await t.call("PUT", "/api/v1/integrations/instabox", { apiKey: "ibk_good_key_5678" });
    expect(ib.body.data).toMatchObject({ workspace: "acme", plan: "free", maxMachines: 1 });

    const rows = await t.deps.db.select().from(apiKeys).where(eq(apiKeys.userId, user.id));
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.keyEnc).not.toContain("good_key");
      expect(r.keyEnc).not.toContain("good-key");
    }
    const oc = rows.find((r) => r.provider === "opencode")!;
    expect(t.deps.cipher.decrypt(oc.keyEnc, aad.apiKey("opencode", user.id))).toBe("oc-good-key-1234");

    const status = (await t.call("GET", "/api/v1/onboarding")).body.data;
    expect(status.opencode.connected).toBe(true);
    expect(status.instabox.workspace).toBe("acme");
    expect(status.github.available).toBe(false);
    expect((await t.call("POST", "/api/v1/onboarding/complete")).body.data.completed).toBe(true);
  });

  test("onboarding can't complete without OpenCode", async () => {
    await t.signup();
    expect((await t.call("POST", "/api/v1/onboarding/complete")).body.error.code).toBe("opencode_required");
  });
});

describe("bots and tasks", () => {
  const giveKeys = async (userId: string) =>
    t.deps.db.insert(apiKeys).values([
      { userId, provider: "opencode", keyEnc: t.deps.cipher.encrypt("oc-key-1234", aad.apiKey("opencode", userId)), last4: "1234", verifiedAt: new Date() },
      { userId, provider: "instabox", keyEnc: t.deps.cipher.encrypt("ibk-key-5678", aad.apiKey("instabox", userId)), last4: "5678", verifiedAt: new Date() },
    ]);

  test("tasks are refused until the keys the run needs are connected", async () => {
    const user = await t.signup();
    const bot = (await t.call("POST", "/api/v1/bots", { name: "Fixer", purpose: "Fix bugs" })).body.data.bot;
    expect((await t.call("POST", "/api/v1/tasks", { botId: bot.id, prompt: "x" })).body.error.code).toBe("opencode_missing");
    await t.deps.db.insert(apiKeys).values({
      userId: user.id,
      provider: "opencode",
      keyEnc: t.deps.cipher.encrypt("oc-key-1234", aad.apiKey("opencode", user.id)),
      last4: "1234",
      verifiedAt: new Date(),
    });
    expect((await t.call("POST", "/api/v1/tasks", { botId: bot.id, prompt: "x" })).body.error.code).toBe("instabox_missing");
    await t.deps.db.insert(apiKeys).values({
      userId: user.id,
      provider: "instabox",
      keyEnc: t.deps.cipher.encrypt("ibk-key-5678", aad.apiKey("instabox", user.id)),
      last4: "5678",
      verifiedAt: new Date(),
    });
    expect((await t.call("POST", "/api/v1/tasks", { botId: bot.id, prompt: "x" })).status).toBe(201);
  });

  test("CRUD is scoped to the owner", async () => {
    await t.signup();
    const created = await t.call("POST", "/api/v1/bots", { name: "Sentinel", purpose: "Security triage", skills: ["security"] });
    expect(created.status).toBe(201);
    const id = created.body.data.bot.id;
    expect((await t.call("PATCH", `/api/v1/bots/${id}`, { purpose: "Security" })).body.data.bot.purpose).toBe("Security");
    expect((await t.call("GET", "/api/v1/bots")).body.data.bots).toHaveLength(1);

    await t.call("POST", "/api/v1/auth/logout");
    await t.signup("eve@example.com");
    expect((await t.call("GET", `/api/v1/bots/${id}`)).status).toBe(404);
    expect((await t.call("DELETE", `/api/v1/bots/${id}`)).status).toBe(404);
  });

  test("one running task per user", async () => {
    const user = await t.signup();
    await giveKeys(user.id);
    const bot = (await t.call("POST", "/api/v1/bots", { name: "Fixer", purpose: "Fix bugs" })).body.data.bot;
    await t.call("POST", "/api/v1/tasks", { botId: bot.id, prompt: "first" });
    await t.call("POST", "/api/v1/tasks", { botId: bot.id, prompt: "second" });
    const first = await claimNext(t.deps);
    expect(first?.prompt).toBe("first");
    expect(await claimNext(t.deps)).toBeNull();
    await t.deps.db.update(tasks).set({ status: "succeeded" }).where(eq(tasks.id, first!.id));
    expect((await claimNext(t.deps))?.prompt).toBe("second");
  });

  test("cancelling a queued task", async () => {
    const user = await t.signup();
    await giveKeys(user.id);
    const bot = (await t.call("POST", "/api/v1/bots", { name: "Fixer", purpose: "Fix bugs" })).body.data.bot;
    const task = (await t.call("POST", "/api/v1/tasks", { botId: bot.id, prompt: "x" })).body.data.task;
    expect((await t.call("POST", `/api/v1/tasks/${task.id}/cancel`)).body.data.cancelled).toBe(true);
    expect((await t.call("GET", `/api/v1/tasks/${task.id}`)).body.data.task.status).toBe("cancelled");
    expect((await t.call("POST", `/api/v1/tasks/${task.id}/cancel`)).body.error.code).toBe("task_finished");
  });
});

describe("slack events", () => {
  const sign = (body: string, ts = Math.floor(Date.now() / 1000).toString()) => ({
    "content-type": "application/json",
    "x-slack-request-timestamp": ts,
    "x-slack-signature": `v0=${createHmac("sha256", "slack-secret").update(`v0:${ts}:${body}`).digest("hex")}`,
  });

  test("rejects bad signatures and answers the URL challenge", async () => {
    const body = JSON.stringify({ type: "url_verification", challenge: "abc" });
    expect((await t.call("POST", "/api/v1/slack/events", body, { ...sign(body), "x-slack-signature": "v0=00" })).status).toBe(401);
    const ok = await t.call("POST", "/api/v1/slack/events", body, sign(body));
    expect(ok.body.challenge).toBe("abc");
    expect(ok.body.ok).toBe(true);
  });

  test("a mention queues one task for the right bot, retries are deduped", async () => {
    const user = await t.signup();
    await t.deps.db.insert(slackConnections).values({
      userId: user.id,
      teamId: "T1",
      teamName: "Acme",
      botUserId: "UBOT",
      botTokenEnc: t.deps.cipher.encrypt("xoxb-1", aad.slackBot(user.id)),
      scope: "",
      channelId: "C1",
      channelName: "eng",
    });
    await t.call("POST", "/api/v1/bots", { name: "Fixer", purpose: "bugs", skills: ["bugfix"] });
    await t.call("POST", "/api/v1/bots", { name: "Sentinel", purpose: "security", skills: ["security"] });
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event_id: "Ev1",
      event: { type: "app_mention", user: "U1", text: "<@UBOT> we have an XSS in the login page", ts: "1.0", channel: "C1" },
    });
    expect((await t.call("POST", "/api/v1/slack/events", body, sign(body))).body.data.received).toBe(true);
    await t.call("POST", "/api/v1/slack/events", body, sign(body));
    const rows = await t.deps.db.select().from(tasks);
    expect(rows).toHaveLength(1);
    const [bot] = await t.deps.db.select().from(bots).where(eq(bots.id, rows[0]!.botId));
    expect(bot!.name).toBe("Sentinel");
    expect(rows[0]).toMatchObject({ source: "slack", slackThreadTs: "1.0", prompt: "we have an XSS in the login page" });
    expect(providers.calls.some((c) => c.url.endsWith("/chat.postMessage"))).toBe(true);
  });

  test("routing prefers a named bot", () => {
    const mk = (name: string, skills: string[]) => ({ name, skills, enabled: true, slackChannelId: "C1" }) as any;
    const all = [mk("Fixer", ["bugfix"]), mk("Sentinel", ["security"])];
    expect(routeToBot(all, "C1", "fixer please look at this XSS")?.name).toBe("Fixer");
    expect(routeToBot(all, "C1", "the checkout crashes")?.name).toBe("Fixer");
  });
});

describe("vm callbacks", () => {
  test("need the run's token and finish the task", async () => {
    const user = await t.signup();
    await t.deps.db
      .insert(apiKeys)
      .values([
        { userId: user.id, provider: "opencode", keyEnc: t.deps.cipher.encrypt("oc-key-1234", aad.apiKey("opencode", user.id)), last4: "1234", verifiedAt: new Date() },
        { userId: user.id, provider: "instabox", keyEnc: t.deps.cipher.encrypt("ibk-key-5678", aad.apiKey("instabox", user.id)), last4: "5678", verifiedAt: new Date() },
      ]);
    const bot = (await t.call("POST", "/api/v1/bots", { name: "Fixer", purpose: "Fix bugs" })).body.data.bot;
    await t.call("POST", "/api/v1/tasks", { botId: bot.id, prompt: "x" });
    const task = (await claimNext(t.deps))!;
    const [m] = await t.deps.db.insert(machines).values({ userId: user.id, instaboxId: "m1", name: "m" }).returning();
    const [run] = await t.deps.db
      .insert(vmRuns)
      .values({ taskId: task.id, machineId: m!.id, callbackTokenHash: sha256("tok"), deadlineAt: new Date(Date.now() + 60_000) })
      .returning();
    const path = `/api/v1/vm/runs/${run!.id}/events`;
    expect((await t.call("POST", path, { type: "done", message: "ok" }, { authorization: "Bearer nope" })).status).toBe(401);
    expect((await t.call("POST", path, { type: "done", message: "Fixed it" }, { authorization: "Bearer tok" })).status).toBe(200);
    const [after] = await t.deps.db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(after).toMatchObject({ status: "succeeded", result: { summary: "Fixed it" } });
  });
});

describe("github webhooks", () => {
  test("verified with the webhook secret via Octokit", async () => {
    const body = JSON.stringify({ zen: "hi", hook_id: 1 });
    const sig = `sha256=${createHmac("sha256", "gh-secret").update(body).digest("hex")}`;
    const headers = { "content-type": "application/json", "x-github-delivery": "d1", "x-github-event": "ping" };
    expect((await t.call("POST", "/github/events", body, { ...headers, "x-hub-signature-256": "sha256=00" })).status).toBe(401);
    expect((await t.call("POST", "/github/events", body, { ...headers, "x-hub-signature-256": sig })).body).toEqual({
      ok: true,
      data: { pong: true },
    });
  });
});

describe("slack events with only a signing secret", () => {
  test("the Request URL challenge passes before OAuth is configured", async () => {
    await t.close();
    t = await setup({ SLACK_SIGNING_SECRET: "only-signing" });
    const body = JSON.stringify({ type: "url_verification", challenge: "xyz" });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = `v0=${createHmac("sha256", "only-signing").update(`v0:${ts}:${body}`).digest("hex")}`;
    const r = await t.call("POST", "/api/v1/slack/events", body, {
      "content-type": "application/json",
      "x-slack-request-timestamp": ts,
      "x-slack-signature": sig,
    });
    expect(r.body.challenge).toBe("xyz");
    expect((await t.call("GET", "/health")).status).toBe(200);
  });
});

test("session cookie is Secure when the web app is on https", async () => {
  await t.close();
  t = await setup({ WEB_URL: "https://agentcall-web.vercel.app" });
  const res = await t.app.request("/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "A", email: "a@example.com", password: "12345678" }),
  });
  expect(res.headers.get("set-cookie")).toContain("Secure");
});
