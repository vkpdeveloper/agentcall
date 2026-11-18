"use client";

import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Key01Icon,
  LinkSquare02Icon,
  Search01Icon,
  SquareLock02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { AnimatePresence, motion, MotionConfig, type HTMLMotionProps } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { GitHubIcon, OpenCodeIcon, SlackIcon } from "@/components/brand-icons";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, type Bot, type Channel, type OnboardingStatus } from "@/lib/api";
import { Backdrop } from "./auth-form";
import { BotForm } from "./bot-form";
import { RETURN_KEY } from "./oauth-callback";
import { Banner, Check, ease, FieldError, Spinner } from "./ui";

type StepId = "github" | "slack" | "opencode" | "instabox" | "bot" | "done";

const STEPS: { id: Exclude<StepId, "done">; label: string; optional: boolean }[] = [
  { id: "github", label: "GitHub", optional: true },
  { id: "slack", label: "Slack", optional: true },
  { id: "opencode", label: "OpenCode", optional: false },
  { id: "instabox", label: "instabox", optional: false },
  { id: "bot", label: "First bot", optional: false },
];

const SKIP_KEY = "agentcall:onboarding-skipped";

const NEUTRAL_CHIP = "border-white/[0.07] bg-white/[0.03] text-neutral-400";

type ActionButtonProps = Omit<HTMLMotionProps<"button">, "children"> & VariantProps<typeof buttonVariants> & { loading?: boolean; children?: ReactNode };

/** shadcn Button with the loading affordance and tap animation the steps rely on. */
function ActionButton({ loading, disabled, variant, size, className, children, ...props }: ActionButtonProps) {
  return (
    <motion.button
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), "relative", className)}
      {...props}
    >
      <span className={`inline-flex items-center gap-2 transition-opacity ${loading ? "opacity-0" : ""}`}>{children}</span>
      {loading && <Spinner className="absolute" />}
    </motion.button>
  );
}

function isDone(id: StepId, s: OnboardingStatus) {
  switch (id) {
    case "github":
      return s.github.connected;
    case "slack":
      return Boolean(s.slack.channel);
    case "opencode":
      return s.opencode.connected;
    case "instabox":
      return s.instabox.connected;
    case "bot":
      return s.bot.created;
    default:
      return false;
  }
}

export function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [step, setStep] = useState<StepId | null>(null);
  const [direction, setDirection] = useState(1);
  const [loadError, setLoadError] = useState<string>();

  const refresh = useCallback(async () => {
    const s = await api<OnboardingStatus>("/onboarding");
    setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    refresh()
      .then((s) => {
        const requested = params.get("step") as StepId | null;
        if (requested && (STEPS.some((x) => x.id === requested) || requested === "done")) return setStep(requested);
        const skipped: string[] = JSON.parse(sessionStorage.getItem(SKIP_KEY) ?? "[]");
        const first = STEPS.find((x) => !isDone(x.id, s) && !skipped.includes(x.id));
        setStep(first?.id ?? "done");
      })
      .catch((e) => {
        if ((e as { status?: number }).status === 401) router.replace("/login?next=/onboarding");
        else setLoadError(errorMessage(e));
      });
  }, [params, refresh, router]);

  const index = step === "done" ? STEPS.length : STEPS.findIndex((s) => s.id === step);
  const go = (to: StepId) => {
    const toIndex = to === "done" ? STEPS.length : STEPS.findIndex((s) => s.id === to);
    setDirection(toIndex >= index ? 1 : -1);
    setStep(to);
    window.history.replaceState(null, "", `/onboarding?step=${to}`);
  };
  const next = () => go(STEPS[index + 1]?.id ?? "done");
  const back = () => index > 0 && go(STEPS[index - 1]!.id);
  const skip = () => {
    const skipped: string[] = JSON.parse(sessionStorage.getItem(SKIP_KEY) ?? "[]");
    sessionStorage.setItem(SKIP_KEY, JSON.stringify([...new Set([...skipped, step])]));
    next();
  };
  const advanceAfter = async () => {
    await refresh();
    next();
  };

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-dvh overflow-hidden px-5 pb-16 pt-6 sm:pt-10">
        <Backdrop />
        <div className="relative mx-auto max-w-[1040px]">
          <header className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
              <Logo size={30} />
              agentcall
            </Link>
            {step && step !== "done" && (
              <span className="font-mono text-xs text-muted-foreground">
                Step {index + 1} of {STEPS.length}
              </span>
            )}
          </header>

          {status && step && <Progress index={index} status={status} />}

          <div className="mt-8 grid gap-10 md:mt-14 md:grid-cols-[220px_1fr] md:gap-14">
            {status && step ? <Rail current={step} status={status} onPick={(id) => go(id)} /> : <div className="hidden md:block" />}

            <div className="relative mx-auto w-full max-w-[560px] md:mx-0">
              {loadError ? (
                <Banner>{loadError}</Banner>
              ) : !status || !step ? (
                <div className="grid h-80 place-items-center text-muted-foreground">
                  <Spinner size={22} />
                </div>
              ) : (
                <AnimatePresence mode="wait" custom={direction} initial={false}>
                  <motion.div
                    key={step}
                    custom={direction}
                    variants={{
                      enter: (d: number) => ({ opacity: 0, x: d * 40, filter: "blur(4px)" }),
                      center: { opacity: 1, x: 0, filter: "blur(0px)" },
                      exit: (d: number) => ({ opacity: 0, x: d * -40, filter: "blur(4px)" }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.38, ease }}
                  >
                    {step === "github" && <GitHubStep status={status} onNext={next} onSkip={skip} />}
                    {step === "slack" && <SlackStep status={status} refresh={refresh} onNext={next} onSkip={skip} onBack={back} />}
                    {step === "opencode" && <OpenCodeStep status={status} onSaved={advanceAfter} onNext={next} onBack={back} />}
                    {step === "instabox" && <InstaboxStep status={status} onSaved={advanceAfter} onNext={next} onBack={back} />}
                    {step === "bot" && <BotStep status={status} onSaved={advanceAfter} onNext={next} onBack={back} />}
                    {step === "done" && <DoneStep status={status} onFix={go} />}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>
      </main>
    </MotionConfig>
  );
}

// ---------------- chrome ----------------

function Progress({ index, status }: { index: number; status: OnboardingStatus }) {
  return (
    <div className="mt-6 flex gap-1.5 md:hidden" aria-hidden>
      {STEPS.map((s, i) => (
        <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.03]">
          <motion.div
            className={`h-full rounded-full ${isDone(s.id, status) ? "bg-emerald-300" : "bg-primary"}`}
            initial={false}
            animate={{ width: i < index || isDone(s.id, status) ? "100%" : i === index ? "45%" : "0%" }}
            transition={{ duration: 0.5, ease }}
          />
        </div>
      ))}
    </div>
  );
}

function Rail({ current, status, onPick }: { current: StepId; status: OnboardingStatus; onPick: (id: StepId) => void }) {
  return (
    <nav aria-label="Setup steps" className="hidden md:block">
      <ol className="relative space-y-1">
        {STEPS.map((s) => {
          const done = isDone(s.id, status);
          const active = s.id === current;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s.id)}
                className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="rail-active"
                    className="absolute inset-0 rounded-xl border border-primary/25 bg-primary/10"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                )}
                <span
                  className={`relative grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-medium transition-colors ${
                    done
                      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                      : active
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {done ? <Check size={13} /> : STEPS.findIndex((x) => x.id === s.id) + 1}
                </span>
                <span className="relative">{s.label}</span>
                {s.optional && !done && <span className="relative ml-auto text-[11px] text-muted-foreground">optional</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepShell({
  icon,
  title,
  description,
  children,
  footer,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="gap-0 p-6 sm:p-8">
      <motion.div
        initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.08 }}
        className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-foreground"
      >
        {icon}
      </motion.div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <div className="mt-2 text-pretty text-[15px] leading-relaxed text-muted-foreground">{description}</div>
      {children && <div className="mt-7">{children}</div>}
      {footer && <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">{footer}</div>}
    </Card>
  );
}

function BackButton({ onBack }: { onBack?: () => void }) {
  if (!onBack) return <span />;
  return (
    <ActionButton variant="ghost" type="button" onClick={onBack} className="-ml-3 px-3">
      <HugeiconsIcon icon={ArrowLeft01Icon} size={16} /> Back
    </ActionButton>
  );
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((t, i) => (
        <motion.li
          key={t}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease, delay: 0.12 + i * 0.06 }}
          className="flex gap-3 text-sm text-muted-foreground"
        >
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Check size={11} />
          </span>
          {t}
        </motion.li>
      ))}
    </ul>
  );
}

function Connected({ children, onChange }: { children: ReactNode; onChange?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease }}
      className="flex items-center gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-300/15 text-emerald-200">
        <Check size={14} />
      </span>
      <div className="min-w-0 flex-1 text-sm text-emerald-200">{children}</div>
      {onChange && (
        <button type="button" onClick={onChange} className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
          Change
        </button>
      )}
    </motion.div>
  );
}

export function useRedirect(path: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const start = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const { url } = await api<{ url: string }>(path);
      sessionStorage.setItem(RETURN_KEY, window.location.pathname);
      window.location.assign(url);
    } catch (e) {
      setLoading(false);
      setError(errorMessage(e));
    }
  };
  return { start, loading, error };
}

// ---------------- steps ----------------

function GitHubStep({ status, onNext, onSkip }: { status: OnboardingStatus; onNext: () => void; onSkip: () => void }) {
  const install = useRedirect("/integrations/github/install");
  const params = useSearchParams();
  const gh = status.github;
  return (
    <StepShell
      icon={<GitHubIcon size={24} />}
      title="Connect GitHub"
      description="Install the agentcall GitHub App on the repositories your agents should work on."
      footer={
        <>
          <span />
          {gh.connected ? (
            <ActionButton onClick={onNext}>
              Continue <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </ActionButton>
          ) : (
            <ActionButton variant="ghost" onClick={onSkip}>
              Skip for now
            </ActionButton>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <Points
          items={[
            "You pick the repositories. Nothing else is visible to agents.",
            "Commits and pull requests are made by the agentcall app, never as you.",
            "Each run gets a one-hour token scoped to a single repository.",
          ]}
        />
        <Banner>{params.get("error") === "github" ? "That GitHub connection didn't go through. Try again." : install.error}</Banner>
        {gh.connected ? (
          <Connected onChange={gh.available ? install.start : undefined}>
            Connected to <span className="font-medium text-foreground">{gh.account?.login}</span>
            <span className="text-emerald-200/60"> · {gh.account?.repositorySelection === "all" ? "all repositories" : "selected repositories"}</span>
          </Connected>
        ) : gh.available ? (
          <ActionButton onClick={install.start} loading={install.loading} className="w-full">
            <GitHubIcon size={16} /> Install GitHub App
          </ActionButton>
        ) : (
          <Banner tone="info">GitHub isn&apos;t configured on this server yet. You can connect it later from the dashboard.</Banner>
        )}
      </div>
    </StepShell>
  );
}

function SlackStep({
  status,
  refresh,
  onNext,
  onSkip,
  onBack,
}: {
  status: OnboardingStatus;
  refresh: () => Promise<OnboardingStatus>;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const install = useRedirect("/integrations/slack/install");
  const params = useSearchParams();
  const slack = status.slack;
  const [picking, setPicking] = useState(slack.connected && !slack.channel);

  useEffect(() => setPicking(slack.connected && !slack.channel), [slack.connected, slack.channel]);

  return (
    <StepShell
      icon={<SlackIcon size={24} />}
      title={picking ? "Pick a channel" : "Add agentcall to Slack"}
      description={
        picking
          ? "Your agents listen and report here. Mention them in this channel to hand over work."
          : "Your bots join one channel, take issues from your team and report back in the thread."
      }
      footer={
        <>
          <BackButton onBack={onBack} />
          {slack.channel && !picking ? (
            <ActionButton onClick={onNext}>
              Continue <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </ActionButton>
          ) : (
            <ActionButton variant="ghost" onClick={onSkip}>
              Skip for now
            </ActionButton>
          )}
        </>
      }
    >
      {picking ? (
        <ChannelPicker
          current={slack.channel?.id}
          onPicked={async () => {
            await refresh();
            setPicking(false);
          }}
        />
      ) : (
        <div className="space-y-6">
          <Points
            items={[
              "Mention @agentcall with a bug, a security report or a question.",
              "Each bot posts under its own name and keeps one status message updated.",
              "Reply in the thread to steer it, ask for status or cancel.",
            ]}
          />
          <Banner>{params.get("error") === "slack" ? "That Slack connection didn't go through. Try again." : install.error}</Banner>
          {slack.channel ? (
            <Connected onChange={() => setPicking(true)}>
              <span className="font-medium text-foreground">#{slack.channel.name}</span>
              <span className="text-emerald-200/60"> in {slack.team?.name}</span>
            </Connected>
          ) : slack.available ? (
            <ActionButton onClick={install.start} loading={install.loading} className="w-full">
              <SlackIcon size={16} /> Add to Slack
            </ActionButton>
          ) : (
            <Banner tone="info">Slack isn&apos;t configured on this server yet. You can connect it later from the dashboard.</Banner>
          )}
        </div>
      )}
    </StepShell>
  );
}

function ChannelPicker({ current, onPicked }: { current?: string; onPicked: () => Promise<void> }) {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api<{ channels: Channel[] }>("/integrations/slack/channels")
      .then((r) => setChannels(r.channels))
      .catch((e) => {
        setChannels([]);
        setError(errorMessage(e));
      });
  }, []);

  const shown = useMemo(
    () => (channels ?? []).filter((c) => c.name.toLowerCase().includes(query.trim().replace(/^#/, "").toLowerCase())),
    [channels, query],
  );

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(undefined);
    try {
      await api("/integrations/slack/channel", { method: "PUT", body: { channelId: selected } });
      await onPicked();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <HugeiconsIcon icon={Search01Icon} size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search channels"
          aria-label="Search channels"
          className="h-11 rounded-xl pl-10 pr-3.5 text-[15px] md:text-[15px]"
        />
      </div>
      <div role="radiogroup" aria-label="Channels" className="max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-border p-1.5">
        {channels === null ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 rounded-xl" />)
        ) : shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No channels match.</p>
        ) : (
          shown.map((c) => {
            const active = c.id === selected;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelected(c.id)}
                className={`relative flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="channel-active"
                    className="absolute inset-0 rounded-xl border border-primary/25 bg-primary/10"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative w-4 text-center text-muted-foreground">
                  {c.isPrivate ? <HugeiconsIcon icon={SquareLock02Icon} size={14} /> : "#"}
                </span>
                <span className="relative flex-1 truncate">{c.name}</span>
                {c.isPrivate && !c.isMember && <span className="relative text-[11px] text-muted-foreground">invite needed</span>}
              </button>
            );
          })
        )}
      </div>
      <Banner>{error}</Banner>
      <ActionButton onClick={save} loading={saving} disabled={!selected} className="w-full">
        Use this channel
      </ActionButton>
    </div>
  );
}

function KeyForm({
  path,
  placeholder,
  label,
  onSaved,
}: {
  path: string;
  placeholder: string;
  label: string;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const inputId = useId();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      await api(path, { method: "PUT", body: { apiKey: value.trim() } });
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor={inputId} className="text-[13px] text-foreground">
            {label}
          </Label>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <HugeiconsIcon icon={SquareLock02Icon} size={12} /> Encrypted with AES-256
          </span>
        </div>
        <Input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          className="h-11 rounded-xl text-[15px]"
          autoFocus
        />
        <FieldError message={error} />
      </div>
      <ActionButton type="submit" loading={saving} disabled={value.trim().length < 8} className="w-full">
        {saving ? "Checking" : "Verify and save"}
      </ActionButton>
    </form>
  );
}

function OpenCodeStep({
  status,
  onSaved,
  onNext,
  onBack,
}: {
  status: OnboardingStatus;
  onSaved: () => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [replacing, setReplacing] = useState(false);
  const oc = status.opencode;
  return (
    <StepShell
      icon={<OpenCodeIcon size={24} />}
      title="Add your OpenCode key"
      description={
        <>
          OpenCode is the agent behind every bot. Your key unlocks your models and subscription. Get one at{" "}
          <a href="https://opencode.ai/auth" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-foreground underline decoration-border underline-offset-4 hover:text-primary">
            opencode.ai <HugeiconsIcon icon={LinkSquare02Icon} size={13} />
          </a>
          .
        </>
      }
      footer={
        <>
          <BackButton onBack={onBack} />
          {oc.connected && !replacing && (
            <ActionButton onClick={onNext}>
              Continue <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </ActionButton>
          )}
        </>
      }
    >
      {oc.connected && !replacing ? (
        <Connected onChange={() => setReplacing(true)}>
          Key ending in <span className="font-mono text-foreground">••••{oc.last4}</span> verified
        </Connected>
      ) : (
        <KeyForm path="/integrations/opencode" label="API key" placeholder="sk-…" onSaved={onSaved} />
      )}
    </StepShell>
  );
}

function InstaboxStep({
  status,
  onSaved,
  onNext,
  onBack,
}: {
  status: OnboardingStatus;
  onSaved: () => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [replacing, setReplacing] = useState(false);
  const ib = status.instabox;
  return (
    <StepShell
      icon={<HugeiconsIcon icon={Key01Icon} size={22} />}
      title="Connect instabox"
      description={
        <>
          Agents work in a cloud machine on your instabox account: they clone, test the product in a real browser and record
          repros. Create a key at{" "}
          <a href="https://instabox.sh" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-foreground underline decoration-border underline-offset-4 hover:text-primary">
            instabox.sh <HugeiconsIcon icon={LinkSquare02Icon} size={13} />
          </a>
          .
        </>
      }
      footer={
        <>
          <BackButton onBack={onBack} />
          {ib.connected && !replacing && (
            <ActionButton onClick={onNext}>
              Continue <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </ActionButton>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {ib.connected && !replacing ? (
          <Connected onChange={() => setReplacing(true)}>
            <span className="font-medium text-foreground">{ib.workspace}</span>
            <span className="text-emerald-200/60">
              {" "}
              · {ib.plan} plan · ••••{ib.last4}
            </span>
          </Connected>
        ) : (
          <KeyForm path="/integrations/instabox" label="API key" placeholder="ibk_…" onSaved={onSaved} />
        )}
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          On the free plan agentcall keeps a single machine for you. It sleeps when idle and wakes for each task, and tasks
          run one at a time.
        </p>
      </div>
    </StepShell>
  );
}

function BotStep({
  status,
  onSaved,
  onNext,
  onBack,
}: {
  status: OnboardingStatus;
  onSaved: () => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [created, setCreated] = useState<Bot | null>(null);
  return (
    <StepShell
      icon={<span className="text-2xl">🤖</span>}
      title="Create your first bot"
      description="Give it a name and a job. You can add more bots later, each with its own purpose."
      footer={
        <>
          <BackButton onBack={onBack} />
          {status.bot.created && (
            <ActionButton variant="ghost" onClick={onNext}>
              I already have one
            </ActionButton>
          )}
        </>
      }
    >
      {created ? (
        <Connected>
          <span className="font-medium text-foreground">{created.name}</span> is ready
        </Connected>
      ) : (
        <BotForm
          githubConnected={status.github.connected}
          onSaved={async (b) => {
            setCreated(b);
            await onSaved();
          }}
        />
      )}
    </StepShell>
  );
}

function reviewMeta(id: Exclude<StepId, "done">, s: OnboardingStatus): string | null {
  switch (id) {
    case "github":
      return s.github.account?.login ?? null;
    case "slack":
      return s.slack.channel ? `#${s.slack.channel.name}` : null;
    case "opencode":
      return s.opencode.last4 ? `••••${s.opencode.last4}` : null;
    case "instabox":
      return s.instabox.workspace;
    case "bot":
      return null;
  }
}

function DoneStep({ status, onFix }: { status: OnboardingStatus; onFix: (id: StepId) => void }) {
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string>();
  const missing = STEPS.filter((s) => !s.optional && !isDone(s.id, status));

  const finish = async () => {
    setFinishing(true);
    try {
      await api("/onboarding/complete", { method: "POST" });
      sessionStorage.removeItem(SKIP_KEY);
      router.push("/dashboard");
    } catch (e) {
      setError(errorMessage(e));
      setFinishing(false);
    }
  };

  return (
    <Card className="gap-0 p-8 text-center sm:p-12">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 160, damping: 16 }}
      >
        <Logo size={112} />
      </motion.div>
      <h1 className="mt-10 text-3xl font-semibold tracking-tight text-foreground">
        {missing.length ? "Almost there" : "Your team just grew"}
      </h1>
      <p className="mt-3 max-w-sm text-pretty text-muted-foreground">
        {missing.length
          ? "A couple of things are still needed before agents can pick up work."
          : status.slack.channel
            ? `Mention @agentcall in #${status.slack.channel.name} to hand over the first task.`
            : "Hand over the first task from your dashboard."}
      </p>
      <Card className="mt-8 w-full max-w-xs gap-0 divide-y divide-border overflow-hidden py-0 text-left">
        {STEPS.map((s, i) => {
          const done = isDone(s.id, status);
          return (
            <motion.button
              key={s.id}
              type="button"
              onClick={() => !done && onFix(s.id)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease, delay: 0.25 + i * 0.07 }}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${done ? "text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              <span className={`grid size-5 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-300/10 text-emerald-200" : "border border-border"}`}>
                {done && <Check size={11} />}
              </span>
              {s.label}
              {done ? (
                reviewMeta(s.id, status) && (
                  <Badge className={`ml-auto font-normal ${NEUTRAL_CHIP}`}>{reviewMeta(s.id, status)}</Badge>
                )
              ) : (
                <Badge className={`ml-auto font-normal ${s.optional ? NEUTRAL_CHIP : "border-red-400/25 bg-red-400/10 text-red-300"}`}>
                  {s.optional ? "Skipped" : "Needed"}
                </Badge>
              )}
            </motion.button>
          );
        })}
      </Card>
      <Banner>{error}</Banner>
      <ActionButton onClick={missing.length ? () => onFix(missing[0]!.id) : finish} loading={finishing} className="mt-8 min-w-48">
        {missing.length ? `Finish ${missing[0]!.label}` : "Open dashboard"}
        <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
      </ActionButton>
    </Card>
  );
}
