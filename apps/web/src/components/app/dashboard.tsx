"use client";

import {
  Add01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  CloudServerIcon,
  Delete02Icon,
  GitPullRequestIcon,
  Logout01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { GitHubIcon, OpenCodeIcon, SlackIcon } from "@/components/brand-icons";
import { Logo } from "@/components/logo";
import { api, errorMessage, type Bot, type Integrations, type Task, type User } from "@/lib/api";
import { BotForm, EMOJI } from "./bot-form";
import { useRedirect } from "./onboarding";
import { Banner, Button, Card, ease, Spinner, Textarea } from "./ui";

const STATUS: Record<Task["status"], { label: string; dot: string }> = {
  queued: { label: "Queued", dot: "bg-neutral-400" },
  running: { label: "Working", dot: "bg-gold animate-pulse" },
  succeeded: { label: "Done", dot: "bg-emerald-400" },
  failed: { label: "Failed", dot: "bg-red-400" },
  cancelled: { label: "Cancelled", dot: "bg-neutral-600" },
};

export function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [editing, setEditing] = useState<Bot | "new" | null>(null);
  const [error, setError] = useState<string>();

  const loadTasks = useCallback(() => api<{ tasks: Task[] }>("/tasks").then((r) => setTasks(r.tasks)), []);

  useEffect(() => {
    Promise.all([
      api<{ user: User }>("/auth/me").then((r) => setUser(r.user)),
      api<Integrations>("/integrations").then(setIntegrations),
      api<{ bots: Bot[] }>("/bots").then((r) => setBots(r.bots)),
      loadTasks(),
    ]).catch((e) => {
      if ((e as { status?: number }).status === 401) router.replace("/login?next=/dashboard");
      else setError(errorMessage(e));
    });
  }, [loadTasks, router]);

  // Poll while something is in flight.
  const active = tasks?.some((t) => t.status === "queued" || t.status === "running");
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => void loadTasks().catch(() => undefined), 4000);
    return () => clearInterval(id);
  }, [active, loadTasks]);

  const signOut = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
            <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
              <Logo size={28} />
              agentcall
            </Link>
            <div className="flex items-center gap-1">
              {user && <span className="mr-2 hidden text-sm text-neutral-400 sm:inline">{user.name}</span>}
              <Link href="/onboarding?step=github" aria-label="Integrations" className="grid size-10 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white">
                <HugeiconsIcon icon={Settings01Icon} size={18} />
              </Link>
              <button onClick={signOut} aria-label="Sign out" className="grid size-10 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white">
                <HugeiconsIcon icon={Logout01Icon} size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-5 pb-24 pt-10">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
            <h1 className="text-3xl font-semibold tracking-tight text-white">{user ? `Hi, ${user.name.split(" ")[0]}` : " "}</h1>
            <p className="mt-1.5 text-neutral-400">Your agents, what they&apos;re working on, and what they shipped.</p>
          </motion.div>
          <div className="mt-6">
            <Banner>{error}</Banner>
          </div>

          {integrations && <IntegrationStrip integrations={integrations} />}

          <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
            <section>
              <SectionTitle>Tasks</SectionTitle>
              {bots?.some((b) => b.enabled) && (
                <Composer
                  bots={bots}
                  ready={integrations ? integrations.opencode.connected && integrations.instabox.connected : null}
                  onCreated={(t) => setTasks((ts) => [t, ...(ts ?? [])])}
                />
              )}
              <TaskList
                tasks={tasks}
                bots={bots ?? []}
                onChange={loadTasks}
                hasComposer={bots?.some((b) => b.enabled) ?? true}
                onNewBot={() => setEditing("new")}
              />
            </section>

            <section>
              <SectionTitle
                action={
                  <Button variant="secondary" className="h-9 px-3.5" onClick={() => setEditing("new")}>
                    <HugeiconsIcon icon={Add01Icon} size={16} /> New bot
                  </Button>
                }
              >
                Bots
              </SectionTitle>
              <div className="space-y-3">
                {bots === null ? (
                  [0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-3xl bg-white/[0.03]" />)
                ) : bots.length === 0 ? (
                  <Card className="p-6 text-sm text-neutral-400">No bots yet. Create one to start handing over work.</Card>
                ) : (
                  <AnimatePresence initial={false}>
                    {bots.map((b) => (
                      <BotCard
                        key={b.id}
                        bot={b}
                        onEdit={() => setEditing(b)}
                        onChange={(next) => setBots((all) => (next ? all!.map((x) => (x.id === b.id ? next : x)) : all!.filter((x) => x.id !== b.id)))}
                      />
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </section>
          </div>
        </main>

        <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New bot" : "Edit bot"}>
          {editing && (
            <BotForm
              key={editing === "new" ? "new" : editing.id}
              botId={editing === "new" ? undefined : editing.id}
              initial={editing === "new" ? undefined : editing}
              githubConnected={Boolean(integrations?.github.connected)}
              submitLabel={editing === "new" ? "Create bot" : "Save changes"}
              onSaved={(bot) => {
                setBots((all) => (editing === "new" ? [bot, ...(all ?? [])] : (all ?? []).map((x) => (x.id === bot.id ? bot : x))));
                setEditing(null);
              }}
            />
          )}
        </Sheet>
      </div>
    </MotionConfig>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex h-9 items-center justify-between">
      <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-neutral-500">{children}</h2>
      {action}
    </div>
  );
}

function IntegrationStrip({ integrations: i }: { integrations: Integrations }) {
  const github = useRedirect("/integrations/github/install");
  const items = [
    {
      icon: <GitHubIcon size={18} />,
      name: "GitHub",
      value: i.github.connected ? i.github.account?.login : i.github.available ? null : "Not configured",
      action: i.github.available && !i.github.connected ? github.start : undefined,
      href: undefined as string | undefined,
    },
    {
      icon: <SlackIcon size={18} />,
      name: "Slack",
      value: i.slack.channel ? `#${i.slack.channel.name}` : i.slack.available ? null : "Not configured",
      href: i.slack.available ? "/onboarding?step=slack" : undefined,
    },
    { icon: <OpenCodeIcon size={18} />, name: "OpenCode", value: i.opencode.connected ? `••••${i.opencode.last4}` : null, href: "/onboarding?step=opencode" },
    {
      icon: <HugeiconsIcon icon={CloudServerIcon} size={18} />,
      name: "instabox",
      value: i.instabox.connected ? `${i.instabox.workspace} · ${i.instabox.plan}` : null,
      href: "/onboarding?step=instabox",
    },
  ];
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
      className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4"
    >
      {items.map((it) => {
        const body = (
          <>
            <div className="flex items-center justify-between text-neutral-300">
              {it.icon}
              <span className={`size-2 rounded-full ${it.value && it.value !== "Not configured" ? "bg-emerald-400 shadow-[0_0_10px_rgb(52_211_153_/_0.7)]" : "bg-neutral-700"}`} />
            </div>
            <p className="mt-4 text-sm font-medium text-white">{it.name}</p>
            <p className="mt-0.5 truncate text-[13px] text-neutral-500">{it.value ?? "Connect"}</p>
          </>
        );
        const cls = "block rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-left transition-colors hover:border-white/15 hover:bg-white/[0.04]";
        return (
          <motion.div key={it.name} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}>
            {"action" in it && it.action ? (
              <button onClick={it.action} className={`${cls} w-full`}>
                {body}
              </button>
            ) : it.href ? (
              <Link href={it.href} className={cls}>
                {body}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function Composer({ bots, ready, onCreated }: { bots: Bot[]; ready: boolean | null; onCreated: (t: Task) => void }) {
  const enabled = bots.filter((b) => b.enabled);
  const [botId, setBotId] = useState(enabled[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const { task } = await api<{ task: Task }>("/tasks", { body: { botId, prompt } });
      onCreated(task);
      setPrompt("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!enabled.length) return null;
  return (
    <Card className="mb-4 p-4">
      <form onSubmit={submit} className="space-y-3">
        <Textarea
          label="Hand over a task"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="The signup page throws a 500 when the email has a plus sign. Reproduce it, fix it and open a PR."
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 flex-wrap gap-1.5">
            {enabled.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBotId(b.id)}
                className={`relative h-8 rounded-full px-3 text-[13px] transition-colors ${botId === b.id ? "text-white" : "text-neutral-500 hover:text-neutral-200"}`}
              >
                {botId === b.id && (
                  <motion.span layoutId="composer-bot" className="absolute inset-0 rounded-full border border-white/15 bg-white/[0.06]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                )}
                <span className="relative">
                  {EMOJI[b.emoji] ?? "🤖"} {b.name}
                </span>
              </button>
            ))}
          </div>
          <Button type="submit" loading={saving} disabled={!prompt.trim() || !botId || ready === false} className="h-9 px-4">
            Send <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
          </Button>
        </div>
        {ready === false && (
          <Banner tone="info">
            Add your <Link href="/onboarding?step=opencode" className="underline underline-offset-2">OpenCode</Link> and{" "}
            <Link href="/onboarding?step=instabox" className="underline underline-offset-2">instabox</Link> keys before handing over
            tasks.
          </Banner>
        )}
        <Banner>{error}</Banner>
      </form>
    </Card>
  );
}

function TaskList({
  tasks,
  bots,
  onChange,
  hasComposer = true,
  onNewBot,
}: {
  tasks: Task[] | null;
  bots: Bot[];
  onChange: () => Promise<void>;
  hasComposer?: boolean;
  onNewBot?: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (tasks === null) return <div className="h-40 animate-pulse rounded-3xl bg-white/[0.03]" />;
  if (!tasks.length) {
    return (
      <Card className="flex flex-col items-center px-6 py-14 text-center">
        <Logo size={44} />
        <p className="mt-6 font-medium text-white">Nothing yet</p>
        {hasComposer ? (
          <p className="mt-1 max-w-xs text-sm text-neutral-500">Mention a bot in Slack or hand over a task above. Its progress shows up here.</p>
        ) : (
          <>
            <p className="mt-1 max-w-xs text-sm text-neutral-500">Create a bot to start handing over work. Its progress shows up here.</p>
            {onNewBot && (
              <Button variant="secondary" className="mt-5 h-9 px-4" onClick={onNewBot}>
                <HugeiconsIcon icon={Add01Icon} size={15} /> New bot
              </Button>
            )}
          </>
        )}
      </Card>
    );
  }
  return (
    <div className="divide-y divide-white/[0.05] overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.015]">
      <AnimatePresence initial={false}>
        {tasks.map((t) => {
          const bot = bots.find((b) => b.id === t.botId);
          const s = STATUS[t.status];
          return (
            <motion.div key={t.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.3, ease }}>
              <button
                onClick={() => setOpen(open === t.id ? null : t.id)}
                aria-expanded={open === t.id}
                className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
              >
                <span className="mt-0.5 text-lg leading-none">{EMOJI[bot?.emoji ?? ""] ?? "🤖"}</span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-neutral-200">{t.prompt}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
                    <span className={`size-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                    <span>·</span>
                    {bot?.name ?? "Bot"}
                    <span>·</span>
                    {t.source === "slack" ? "Slack" : "Dashboard"}
                    <span>·</span>
                    {ago(t.createdAt)}
                  </p>
                </div>
                {t.result?.prUrl && <HugeiconsIcon icon={GitPullRequestIcon} size={16} className="mt-0.5 text-emerald-300" />}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={14}
                  className={`mt-0.5 shrink-0 text-neutral-600 transition-transform duration-200 ${open === t.id ? "rotate-90" : ""}`}
                />
              </button>
              <AnimatePresence initial={false}>
                {open === t.id && <TaskDetail task={t} onChange={onChange} />}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function TaskDetail({ task, onChange }: { task: Task; onChange: () => Promise<void> }) {
  const [events, setEvents] = useState<{ id: number; type: string; message: string; createdAt: string }[] | null>(null);
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () =>
      api<{ events: NonNullable<typeof events> }>(`/tasks/${task.id}`)
        .then((r) => live && setEvents(r.events))
        .catch(() => undefined);
    void load();
    const active = task.status === "queued" || task.status === "running";
    const id = active ? setInterval(load, 4000) : undefined;
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [task.id, task.status]);

  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
      <div className="space-y-4 px-5 pb-5 pl-14">
        {task.result?.summary && <p className="whitespace-pre-wrap rounded-2xl bg-white/[0.03] p-4 text-sm leading-relaxed text-neutral-300">{task.result.summary}</p>}
        {task.error && <p className="text-sm text-red-300">{task.error}</p>}
        <ol className="space-y-1.5 border-l border-white/10 pl-4">
          {events === null ? (
            <Spinner />
          ) : (
            events.map((e) => (
              <li key={e.id} className="text-[13px] text-neutral-400">
                <span className="mr-2 font-mono text-[11px] text-neutral-600">{new Date(e.createdAt).toLocaleTimeString()}</span>
                {e.message}
              </li>
            ))
          )}
        </ol>
        <div className="flex gap-2">
          {task.result?.prUrl && (
            <a href={task.result.prUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary" className="h-9 px-3.5">
                <HugeiconsIcon icon={GitPullRequestIcon} size={15} /> Pull request <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
              </Button>
            </a>
          )}
          {(task.status === "queued" || task.status === "running") && (
            <Button
              variant="danger"
              className="h-9 px-3.5"
              loading={cancelling}
              onClick={async () => {
                setCancelling(true);
                await api(`/tasks/${task.id}/cancel`, { method: "POST" }).catch(() => undefined);
                await onChange();
                setCancelling(false);
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={15} /> Cancel
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function BotCard({ bot, onEdit, onChange }: { bot: Bot; onEdit: () => void; onChange: (b: Bot | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const r = await api<{ bot: Bot }>(`/bots/${bot.id}`, { method: "PATCH", body: { enabled: !bot.enabled } });
      onChange(r.bot);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    await api(`/bots/${bot.id}`, { method: "DELETE" }).catch(() => undefined);
    onChange(null);
  };
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.3, ease }}>
      <Card className={`p-5 transition-opacity ${bot.enabled ? "" : "opacity-60"}`}>
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl">{EMOJI[bot.emoji] ?? "🤖"}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-white">{bot.name}</p>
            <p className="mt-0.5 line-clamp-2 text-[13px] text-neutral-400">{bot.purpose}</p>
          </div>
          <Switch on={bot.enabled} disabled={busy} onToggle={toggle} label={`${bot.enabled ? "Pause" : "Resume"} ${bot.name}`} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
          <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono">{bot.model}</span>
          {bot.repos.slice(0, 2).map((r) => (
            <span key={r} className="rounded-full border border-white/10 px-2 py-0.5">
              {r}
            </span>
          ))}
          {bot.repos.length > 2 && <span>+{bot.repos.length - 2}</span>}
          <span className="ml-auto flex gap-1">
            <button onClick={onEdit} className="rounded-full px-2.5 py-1 text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white">
              Edit
            </button>
            {confirm ? (
              <button onClick={remove} className="rounded-full px-2.5 py-1 text-red-300 hover:bg-red-500/10">
                Delete?
              </button>
            ) : (
              <button onClick={() => setConfirm(true)} onBlur={() => setConfirm(false)} aria-label={`Delete ${bot.name}`} className="rounded-full px-2 py-1 text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-red-300">
                <HugeiconsIcon icon={Delete02Icon} size={14} />
              </button>
            )}
          </span>
        </div>
      </Card>
    </motion.div>
  );
}

function Switch({ on, onToggle, disabled, label }: { on: boolean; onToggle: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-300 ${on ? "bg-gold" : "bg-white/15"}`}
    >
      <motion.span
        className="absolute top-0.5 size-5 rounded-full bg-white shadow"
        animate={{ left: on ? 18 : 2 }}
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
      />
    </button>
  );
}

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>("button, [href], input, textarea, select") ?? []).filter(
        (el) => !el.hasAttribute("disabled"),
      );
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = focusables();
        if (!items.length) return;
        const idx = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && idx <= 0) {
          e.preventDefault();
          items[items.length - 1]!.focus();
        } else if (!e.shiftKey && (idx === -1 || idx === items.length - 1)) {
          e.preventDefault();
          items[0]!.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      opener?.focus?.();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal aria-label={title}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            ref={panel}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ duration: 0.35, ease }}
            className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-950 p-6 sm:rounded-3xl sm:p-8"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-neutral-400 hover:bg-white/[0.06] hover:text-white">
                <HugeiconsIcon icon={Cancel01Icon} size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
