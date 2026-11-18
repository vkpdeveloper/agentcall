// Client for the agentcall API. Every response is { ok, data } or { ok, error }.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
  /** Message for a form field, from a validation error. */
  field(name: string) {
    return this.details?.find((d) => d.path === name)?.message;
  }
}

type Init = { method?: string; body?: unknown; signal?: AbortSignal };

export async function api<T>(path: string, init: Init = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      signal: init.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network_error", "Can't reach agentcall. Check your connection.");
  }
  const body = (await res.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string; details?: { path: string; message: string }[] } }
    | null;
  if (!body) throw new ApiError(res.status, "bad_response", "agentcall is having trouble. Try again shortly.");
  if (!body.ok) throw new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  return body.data;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

// ---- shared shapes ----

export type User = { id: string; name: string; email: string; onboarded: boolean };

export type Integrations = {
  github: { available: boolean; connected: boolean; account: { login: string; type: string; repositorySelection: string } | null };
  slack: {
    available: boolean;
    connected: boolean;
    team: { id: string; name: string } | null;
    channel: { id: string; name: string } | null;
  };
  opencode: { connected: boolean; last4: string | null };
  instabox: { connected: boolean; last4: string | null; workspace: string | null; plan: string | null };
};

export type OnboardingStatus = Integrations & { bot: { created: boolean }; completed: boolean };

export type Bot = {
  id: string;
  name: string;
  emoji: string;
  purpose: string;
  instructions: string;
  skills: string[];
  model: string;
  slackChannelId: string | null;
  repos: string[];
  enabled: boolean;
  createdAt: string;
};

export type Task = {
  id: string;
  botId: string;
  source: "slack" | "dashboard" | "api";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  prompt: string;
  repo: string | null;
  result: { summary?: string; prUrl?: string } | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type Model = { id: string; name: string; free: boolean; provider: string };
export type Repo = { fullName: string; private: boolean };
export type Channel = { id: string; name: string; isPrivate: boolean; isMember: boolean };
