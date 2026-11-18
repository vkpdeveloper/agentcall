"use client";

import {
  Add01Icon,
  AiChat02Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  CheckmarkBadge01Icon,
  DashboardCircleIcon,
  Delete02Icon,
  GitPullRequestIcon,
  Logout01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { GitHubIcon, InstaboxIcon, OpenCodeIcon, SlackIcon } from "@/components/brand-icons";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errorMessage, type Bot, type Integrations, type Task, type User } from "@/lib/api";
import { BotForm, EMOJI, SKILLS } from "./bot-form";
import { useRedirect } from "./onboarding";
import { Banner, Button, ease, Spinner, Textarea } from "./ui";

const STATUS: Record<Task["status"], { label: string; chip: string }> = {
  queued: { label: "Queued", chip: "border-white/[0.07] bg-white/[0.03] text-neutral-400" },
  running: { label: "Working", chip: "border-primary/25 bg-primary/10 text-primary" },
  succeeded: { label: "Done", chip: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" },
  failed: { label: "Failed", chip: "border-red-400/25 bg-red-400/10 text-red-300" },
  cancelled: { label: "Cancelled", chip: "border-white/[0.07] bg-white/[0.03] text-neutral-400" },
};

const NEUTRAL_CHIP = "border-white/[0.07] bg-white/[0.03] text-[11px] font-normal text-neutral-400";

function Stats({ bots, tasks }: { bots: Bot[] | null; tasks: Task[] | null }) {
  const items = [
    { label: "Active bots", value: bots?.filter((b) => b.enabled).length },
    { label: "Tasks handed over", value: tasks?.length },
    { label: "Done", value: tasks?.filter((t) => t.status === "succeeded").length },
    { label: "PRs shipped", value: tasks?.filter((t) => t.result?.prUrl).length },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease, delay: 0.1 }}
      className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {items.map((it) => (
        <Card key={it.label} className="gap-0 rounded-xl p-4">
          {it.value === undefined ? (
            <Skeleton className="h-6 w-10" />
          ) : (
            <p className="text-xl font-semibold tracking-tight">{it.value}</p>
          )}
          <p className="mt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{it.label}</p>
        </Card>
      ))}
    </motion.div>
  );
}

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

  const notConnected = integrations
    ? [integrations.github.connected, Boolean(integrations.slack.channel), integrations.opencode.connected, integrations.instabox.connected].filter(
        (c) => !c,
      ).length
    : 0;
  const initials = user
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-14 shrink-0 flex-col items-center border-r border-white/[0.06] py-4 lg:flex">
          <TooltipProvider>
            <Link href="/" aria-label="agentcall home" className="pb-5">
              <Logo size={26} />
            </Link>
            <nav aria-label="Workspace" className="flex flex-col items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href="#top" aria-label="Dashboard" className="grid size-9 place-items-center rounded-[10px] bg-white/[0.06] text-white">
                    <HugeiconsIcon icon={DashboardCircleIcon} size={17} />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="right">Dashboard</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href="#tasks" aria-label="Tasks" className="grid size-9 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-white/[0.04] hover:text-white">
                    <HugeiconsIcon icon={CheckmarkBadge01Icon} size={17} />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="right">Tasks</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href="#bots" aria-label="Bots" className="grid size-9 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-white/[0.04] hover:text-white">
                    <HugeiconsIcon icon={AiChat02Icon} size={17} />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="right">Bots</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/onboarding?step=github"
                    aria-label="Integrations"
                    className="relative grid size-9 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-white/[0.04] hover:text-white"
                  >
                    <HugeiconsIcon icon={Settings01Icon} size={17} />
                    {notConnected > 0 && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-white/70" />}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Integrations</TooltipContent>
              </Tooltip>
            </nav>
            <div className="mt-auto flex flex-col items-center gap-2">
              <span className="grid size-8 place-items-center rounded-full border border-white/[0.08] text-[10px] font-semibold text-neutral-300">{initials}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={signOut} aria-label="Sign out" className="grid size-8 place-items-center rounded-full text-neutral-600 transition-colors hover:text-white">
                    <HugeiconsIcon icon={Logout01Icon} size={15} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </aside>

        <div id="top" className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl lg:hidden">
            <div className="flex h-16 items-center justify-between px-5">
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

          <main className="mx-auto w-full max-w-[960px] px-5 pb-24 pt-8 lg:pt-12">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
            <h1 className="text-2xl font-semibold tracking-tight text-white">{user ? `Hi, ${user.name.split(" ")[0]}` : " "}</h1>
            <p className="mt-1.5 text-sm text-neutral-500">Your agents, what they&apos;re working on, and what they&apos;ve shipped.</p>
          </motion.div>
          {integrations && <ConnectionsBar integrations={integrations} />}
          <Stats bots={bots} tasks={tasks} />
          <div className="mt-6">
            <Banner>{error}</Banner>
          </div>

          <section id="tasks" className="mt-10 scroll-mt-6">
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

          <section id="bots" className="mt-10 scroll-mt-6">
            <SectionTitle
              action={
                <UiButton variant="outline" className="h-9 px-3.5" onClick={() => setEditing("new")}>
                  <HugeiconsIcon icon={Add01Icon} size={16} /> New bot
                </UiButton>
              }
            >
              Bots
            </SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
                {bots === null ? (
                  [0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)
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
        </main>
        </div>

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

function ConnectionsBar({ integrations: i }: { integrations: Integrations }) {
  const github = useRedirect("/integrations/github/install");
  const items = [
    {
      icon: <GitHubIcon size={14} />,
      name: "GitHub",
      value: i.github.connected ? i.github.account?.login : i.github.available ? null : "Not configured",
      action: i.github.available && !i.github.connected ? github.start : undefined,
      href: undefined as string | undefined,
    },
    {
      icon: <SlackIcon size={14} />,
      name: "Slack",
      value: i.slack.channel ? `#${i.slack.channel.name}` : i.slack.available ? null : "Not configured",
      href: i.slack.available ? "/onboarding?step=slack" : undefined,
    },
    { icon: <OpenCodeIcon size={14} />, name: "OpenCode", value: i.opencode.connected ? `••••${i.opencode.last4}` : null, href: "/onboarding?step=opencode" },
    {
      icon: <InstaboxIcon size={14} />,
      name: "instabox",
      value: i.instabox.connected ? `${i.instabox.workspace} · ${i.instabox.plan}` : null,
      href: "/onboarding?step=instabox",
    },
  ];
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {items.map((it) => {
        const connected = Boolean(it.value) && it.value !== "Not configured";
        const pill = (
          <>
            {it.icon}
            <span className="text-neutral-300">{it.name}</span>
            <span className="text-neutral-500">{it.value ?? "Connect"}</span>
            <span className={`size-1.5 rounded-full ${connected ? "bg-white/80" : "bg-neutral-600"}`} />
          </>
        );
        const cls =
          "flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-white/15 hover:bg-white/[0.04]";
        if ("action" in it && it.action) {
          return (
            <button key={it.name} onClick={it.action} className={cls}>
              {pill}
            </button>
          );
        }
        if (it.href) {
          return (
            <Link key={it.name} href={it.href} className={cls}>
              {pill}
            </Link>
          );
        }
        return (
          <span key={it.name} className={cls}>
            {pill}
          </span>
        );
      })}
    </div>
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
    <Card className="mb-4 gap-0 p-4">
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
          <UiButton
            type="submit"
            disabled={!prompt.trim() || !botId || ready === false || saving}
            className="h-9 rounded-full px-4"
          >
            {saving ? <Spinner /> : <>Send <HugeiconsIcon icon={ArrowRight01Icon} size={15} /></>}
          </UiButton>
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
  if (tasks === null) return <Skeleton className="h-40 rounded-2xl" />;
  if (!tasks.length) {
    return (
      <Card className="items-center gap-0 px-6 py-14 text-center">
        <Logo size={44} />
        <p className="mt-6 font-medium text-white">Nothing yet</p>
        {hasComposer ? (
          <p className="mt-1 max-w-xs text-sm text-neutral-500">Mention a bot in Slack or hand over a task above. Its progress shows up here.</p>
        ) : (
          <>
            <p className="mt-1 max-w-xs text-sm text-neutral-500">Create a bot to start handing over work. Its progress shows up here.</p>
            {onNewBot && (
              <UiButton variant="outline" className="mt-5 h-9 px-4" onClick={onNewBot}>
                <HugeiconsIcon icon={Add01Icon} size={15} /> New bot
              </UiButton>
            )}
          </>
        )}
      </Card>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-4 border-b border-border px-5 py-2.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        <span className="flex-1">Task</span>
        <span className="hidden w-24 sm:block">Status</span>
        <span className="hidden w-24 md:block">Bot</span>
        <span className="hidden w-14 sm:block">Via</span>
        <span className="hidden w-16 sm:block text-right">When</span>
        <span className="w-4" />
      </div>
      <AnimatePresence initial={false}>
        {tasks.map((t) => {
          const bot = bots.find((b) => b.id === t.botId);
          const s = STATUS[t.status];
          return (
            <motion.div key={t.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.3, ease }}>
              <button
                onClick={() => setOpen(open === t.id ? null : t.id)}
                aria-expanded={open === t.id}
                className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
                  <span className="mr-2">{EMOJI[bot?.emoji ?? ""] ?? "🤖"}</span>
                  {t.prompt}
                </span>
                <Badge variant="outline" className={`${s.chip} hidden w-24 shrink-0 text-center text-[11px] sm:block`}>{s.label}</Badge>
                <span className="hidden w-24 shrink-0 truncate text-xs text-neutral-500 md:block">{bot?.name ?? "Bot"}</span>
                <span className="hidden w-14 shrink-0 text-xs text-neutral-500 sm:block">{t.source === "slack" ? "Slack" : "Dash"}</span>
                <span className="hidden w-16 shrink-0 text-right text-xs text-neutral-500 sm:block">{ago(t.createdAt)}</span>
                <span className="w-4 shrink-0 text-right">
                  {t.result?.prUrl ? (
                    <HugeiconsIcon icon={GitPullRequestIcon} size={14} className="text-neutral-300" />
                  ) : (
                    <HugeiconsIcon icon={ArrowRight01Icon} size={12} className={`text-neutral-600 transition-transform duration-200 ${open === t.id ? "rotate-90" : ""}`} />
                  )}
                </span>
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
              <UiButton variant="outline" className="h-9 px-3.5">
                <HugeiconsIcon icon={GitPullRequestIcon} size={15} /> Pull request <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
              </UiButton>
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
      <Card className={`gap-0 p-5 transition-opacity ${bot.enabled ? "" : "opacity-60"}`}>
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl">{EMOJI[bot.emoji] ?? "🤖"}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{bot.name}</p>
            <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{bot.purpose}</p>
          </div>
          <Switch
            checked={bot.enabled}
            onCheckedChange={() => void toggle()}
            disabled={busy}
            aria-label={`${bot.enabled ? "Pause" : "Resume"} ${bot.name}`}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
          <Badge variant="outline" className={`${NEUTRAL_CHIP} font-mono`}>{bot.model}</Badge>
          {bot.repos.slice(0, 2).map((r) => (
            <Badge key={r} variant="outline" className={NEUTRAL_CHIP}>
              {r}
            </Badge>
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
        {bot.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {bot.skills.map((id) => (
              <Badge key={id} variant="outline" className={NEUTRAL_CHIP}>
                {SKILLS.find((s) => s.id === id)?.label ?? id}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] gap-6 overflow-y-auto rounded-xl border-border bg-card p-6 sm:p-8">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
