// OpenCode (opencode.ai) inference API. We never run inference on the server:
// agents run the opencode binary inside the user's instabox VM. The server only
// validates keys and lists models.

// The same API is served on two routes: "opencode" is pay-per-token, "opencode-go"
// is the OpenCode Go subscription. Model ids overlap between them (glm-5.3 and
// friends exist on both), so a model is identified by "<provider>/<id>" — the same
// reference the opencode CLI accepts as its model value.
const ROUTES: { provider: "opencode" | "opencode-go"; url: string }[] = [
  { provider: "opencode", url: "https://opencode.ai/inference/v1/models" },
  { provider: "opencode-go", url: "https://opencode.ai/inference/go/v1/models" },
];

const BASE = "https://opencode.ai/inference";

export type OpencodeModel = { id: string; name: string; free: boolean; provider: "opencode" | "opencode-go" };

export class OpencodeKeyError extends Error {}

/**
 * Checks a key without spending anything: an empty request is rejected with
 * 401 for a bad key, and with 400 (validation) for a good one.
 */
export async function verifyOpencodeKey(key: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(`${BASE}/openai/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) throw new OpencodeKeyError("OpenCode rejected this API key.");
  if (res.status >= 500) throw new Error(`OpenCode is unavailable (${res.status}). Try again in a moment.`);
}

type UpstreamModel = {
  id: string;
  name?: string;
  type?: string;
  cost?: { text?: { input?: { price?: number }; output?: { price?: number } } };
};

let cache: { at: number; models: OpencodeModel[] } | null = null;

export async function listOpencodeModels(fetchImpl: typeof fetch = fetch): Promise<OpencodeModel[]> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.models;
  // One route being down must not hide the other's models from the picker.
  const settled = await Promise.allSettled(
    ROUTES.map(({ provider, url }) =>
      fetchImpl(url, { signal: AbortSignal.timeout(15_000) }).then(async (res) => {
        if (!res.ok) throw new Error(`${provider} models unavailable (${res.status})`);
        const body = (await res.json()) as { data: UpstreamModel[] };
        return body.data
          .filter((m) => !m.type || m.type === "chat")
          .map((m) => ({
            id: `${provider}/${m.id}`,
            name: m.name ?? m.id,
            free: m.id.endsWith("-free") || (m.cost?.text?.input?.price === 0 && m.cost.text.output?.price === 0),
            provider,
          }));
      }),
    ),
  );
  const models = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (models.length === 0) throw new Error("Could not load OpenCode models.");
  cache = { at: Date.now(), models };
  return models;
}

/** opencode CLI model ids are "<provider>/<model>"; bare ids stay on the pay-per-token route. */
export const toOpencodeModel = (id: string) => (id.includes("/") ? id : `opencode/${id}`);
