"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage, type Bot, type Model, type Repo } from "@/lib/api";
import { ModelPicker } from "./model-picker";
import { Banner, Button, ease, Input, Textarea } from "./ui";

export const EMOJI: Record<string, string> = {
  ":robot_face:": "🤖",
  ":shield:": "🛡️",
  ":bug:": "🐛",
  ":mag:": "🔍",
  ":test_tube:": "🧪",
  ":movie_camera:": "🎥",
  ":zap:": "⚡",
  ":owl:": "🦉",
};

const SKILLS: { id: string; label: string }[] = [
  { id: "triage", label: "Triage" },
  { id: "bugfix", label: "Fix bugs" },
  { id: "security", label: "Security" },
  { id: "testing", label: "Test on a VM" },
  { id: "repro", label: "Record repros" },
  { id: "review", label: "Review PRs" },
  { id: "support", label: "Answer questions" },
];

const TEMPLATES = [
  { name: "Sentinel", emoji: ":shield:", purpose: "Triage security reports from clients, confirm them and patch the vulnerability.", skills: ["security", "triage", "bugfix"] },
  { name: "Fixer", emoji: ":bug:", purpose: "Take bug reports, reproduce them, fix the code and open a pull request.", skills: ["bugfix", "repro", "testing"] },
  { name: "Scout", emoji: ":movie_camera:", purpose: "Test the product on a VM, record the repro and report back with a PDF.", skills: ["testing", "repro"] },
];

export type BotDraft = Pick<Bot, "name" | "emoji" | "purpose" | "instructions" | "skills" | "model" | "repos">;

export function BotForm({
  initial,
  githubConnected,
  submitLabel = "Create bot",
  onSaved,
  botId,
}: {
  initial?: Partial<BotDraft>;
  githubConnected: boolean;
  submitLabel?: string;
  onSaved: (bot: Bot) => void;
  botId?: string;
}) {
  const [draft, setDraft] = useState<BotDraft>({
    name: "",
    emoji: ":robot_face:",
    purpose: "",
    instructions: "",
    skills: [],
    model: "opencode/big-pickle",
    repos: [],
    ...initial,
  });
  const [models, setModels] = useState<Model[] | null>(null);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [advanced, setAdvanced] = useState(Boolean(initial?.instructions));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [banner, setBanner] = useState<string>();
  const set = <K extends keyof BotDraft>(k: K, v: BotDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggle = (k: "skills" | "repos", v: string) =>
    setDraft((d) => ({ ...d, [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v] }));

  useEffect(() => {
    api<{ models: Model[] }>("/integrations/opencode/models")
      .then((r) => setModels(r.models))
      .catch(() => setModels([]));
    if (githubConnected) {
      api<{ repos: Repo[] }>("/integrations/github/repos")
        .then((r) => setRepos(r.repos))
        .catch(() => setRepos([]));
    }
  }, [githubConnected]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setBanner(undefined);
    try {
      const { bot } = await api<{ bot: Bot }>(botId ? `/bots/${botId}` : "/bots", {
        method: botId ? "PATCH" : "POST",
        body: draft,
      });
      onSaved(bot);
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_failed") setError(err);
      else setBanner(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {!botId && !draft.name && (
        <div>
          <p className="mb-2 text-[13px] font-medium text-neutral-300">Start from a template</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {TEMPLATES.map((t) => (
              <motion.button
                key={t.name}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setDraft((d) => ({ ...d, ...t }))}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-left transition-colors hover:border-gold/40 hover:bg-gold/[0.04]"
              >
                <span className="text-lg">{EMOJI[t.emoji]}</span>
                <span className="mt-1 block text-sm font-medium text-white">{t.name}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-neutral-500">{t.purpose}</span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-neutral-300">Icon</p>
          <EmojiPicker value={draft.emoji} onChange={(v) => set("emoji", v)} />
        </div>
        <Input
          label="Name"
          className="flex-1"
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Sentinel"
          maxLength={40}
          error={error?.field("name")}
          hint="Mention it by name in Slack"
        />
      </div>

      <Textarea
        label="What is it for?"
        value={draft.purpose}
        onChange={(e) => set("purpose", e.target.value)}
        placeholder="Triage security reports from clients and patch them."
        rows={3}
        maxLength={500}
        error={error?.field("purpose")}
      />

      <div>
        <p className="mb-2 text-[13px] font-medium text-neutral-300">Kind of work</p>
        <div className="flex flex-wrap gap-2">
          {SKILLS.map((s) => (
            <Chip key={s.id} active={draft.skills.includes(s.id)} onClick={() => toggle("skills", s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[13px] font-medium text-neutral-300">Model</p>
        <ModelPicker models={models} value={draft.model} onChange={(v) => set("model", v)} />
        <p className="mt-1.5 text-xs text-neutral-500">Runs through your OpenCode account.</p>
      </div>

      {githubConnected && (
        <div>
          <p className="mb-2 text-[13px] font-medium text-neutral-300">Repositories it works on</p>
          {repos === null ? (
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 w-28 animate-pulse rounded-full bg-white/[0.05]" />
              ))}
            </div>
          ) : repos.length === 0 ? (
            <p className="text-sm text-neutral-500">The agentcall app can't see any repositories yet.</p>
          ) : (
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
              {repos.map((r) => (
                <Chip key={r.fullName} active={draft.repos.includes(r.fullName)} onClick={() => toggle("repos", r.fullName)}>
                  {r.fullName}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          className="text-[13px] font-medium text-neutral-400 transition-colors hover:text-white"
        >
          {advanced ? "Hide" : "Add"} instructions
        </button>
        <AnimatePresence initial={false}>
          {advanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease }}
              className="overflow-hidden"
            >
              <Textarea
                label="Instructions"
                className="pt-3"
                value={draft.instructions}
                onChange={(e) => set("instructions", e.target.value)}
                placeholder="Always add a regression test. Never touch the billing module."
                rows={4}
                maxLength={4000}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Banner>{banner}</Banner>
      <Button type="submit" loading={saving} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 rounded-full border px-3.5 text-[13px] transition-colors duration-200 ${
        active ? "border-gold/60 bg-gold/[0.12] text-gold" : "border-white/10 text-neutral-400 hover:border-white/25 hover:text-white"
      }`}
    >
      {children}
    </motion.button>
  );
}

function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Choose an icon"
        aria-expanded={open}
        className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-xl transition hover:border-white/25"
      >
        {EMOJI[value] ?? "🤖"}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.16, ease }}
            className="absolute left-0 top-12 z-20 grid w-48 origin-top-left grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-neutral-950 p-2 shadow-2xl"
          >
            {Object.entries(EMOJI).map(([code, glyph]) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  onChange(code);
                  setOpen(false);
                }}
                className={`grid size-10 place-items-center rounded-xl text-xl transition-colors hover:bg-white/10 ${code === value ? "bg-white/10" : ""}`}
              >
                {glyph}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
