import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { bots, slackConnections } from "@agentcall/db";
import type { Deps } from "../deps";
import { requireUser, type AuthVars } from "../lib/auth";
import { errors, ok, validate } from "../lib/http";

export const BOT_SKILLS = ["triage", "bugfix", "security", "testing", "repro", "review", "support"] as const;
export const DEFAULT_MODEL = "opencode/big-pickle";

const repo = z.string().regex(/^[\w.-]+\/[\w.-]+$/, "Use owner/name for repositories.");
const botInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your bot a name.")
    .max(40)
    .regex(/^[\w .-]+$/, "Use letters, numbers, spaces, dots and dashes."),
  emoji: z
    .string()
    .trim()
    .regex(/^:[\w+-]+:$/, "Use a Slack emoji like :robot_face:.")
    .default(":robot_face:"),
  purpose: z.string().trim().min(1, "Say what this bot is for.").max(500),
  instructions: z.string().trim().max(4000).default(""),
  skills: z.array(z.enum(BOT_SKILLS)).max(BOT_SKILLS.length).default([]),
  model: z.string().trim().min(1).max(120).default(DEFAULT_MODEL),
  slackChannelId: z.string().min(1).nullable().optional(),
  repos: z.array(repo).max(20).default([]),
  enabled: z.boolean().default(true),
});

const idParam = z.object({ id: z.string().uuid("Unknown bot.") });

export const publicBot = (b: typeof bots.$inferSelect) => ({
  id: b.id,
  name: b.name,
  emoji: b.emoji,
  purpose: b.purpose,
  instructions: b.instructions,
  skills: b.skills,
  model: b.model,
  slackChannelId: b.slackChannelId,
  repos: b.repos,
  enabled: b.enabled,
  createdAt: b.createdAt,
});

export function botRoutes(deps: Deps) {
  const own = (userId: string, id: string) => and(eq(bots.id, id), eq(bots.userId, userId));

  return new Hono<{ Variables: AuthVars }>()
    .use(requireUser(deps.db))
    .get("/", async (c) => {
      const rows = await deps.db.select().from(bots).where(eq(bots.userId, c.get("user").id)).orderBy(desc(bots.createdAt));
      return ok(c, { bots: rows.map(publicBot), skills: BOT_SKILLS });
    })
    .post("/", validate("json", botInput), async (c) => {
      const user = c.get("user");
      const input = c.req.valid("json");
      let channel = input.slackChannelId;
      if (channel === undefined) {
        const [slack] = await deps.db
          .select({ channelId: slackConnections.channelId })
          .from(slackConnections)
          .where(eq(slackConnections.userId, user.id))
          .limit(1);
        channel = slack?.channelId ?? null;
      }
      const [bot] = await deps.db
        .insert(bots)
        .values({ ...input, slackChannelId: channel, userId: user.id })
        .returning();
      return ok(c, { bot: publicBot(bot!) }, 201);
    })
    .get("/:id", validate("param", idParam), async (c) => {
      const [bot] = await deps.db.select().from(bots).where(own(c.get("user").id, c.req.valid("param").id)).limit(1);
      if (!bot) throw errors.notFound("Bot");
      return ok(c, { bot: publicBot(bot) });
    })
    .patch("/:id", validate("param", idParam), validate("json", botInput.partial()), async (c) => {
      const input = Object.fromEntries(Object.entries(c.req.valid("json")).filter(([, v]) => v !== undefined));
      const [bot] = await deps.db
        .update(bots)
        .set(input)
        .where(own(c.get("user").id, c.req.valid("param").id))
        .returning();
      if (!bot) throw errors.notFound("Bot");
      return ok(c, { bot: publicBot(bot) });
    })
    .delete("/:id", validate("param", idParam), async (c) => {
      const [bot] = await deps.db
        .delete(bots)
        .where(own(c.get("user").id, c.req.valid("param").id))
        .returning({ id: bots.id });
      if (!bot) throw errors.notFound("Bot");
      return ok(c, { deleted: true });
    });
}
