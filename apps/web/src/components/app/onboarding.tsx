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
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { GitHubIcon, InstaboxIcon, OpenCodeIcon, SlackIcon } from "@/components/brand-icons";
import { Logo } from "@/components/logo";
import { api, errorMessage, type Bot, type Channel, type OnboardingStatus } from "@/lib/api";
import { Backdrop } from "./auth-form";
import { BotForm } from "./bot-form";
import { RETURN_KEY } from "./oauth-callback";
import { Banner, Button, Card, Check, ease, Input, Spinner } from "./ui";

type StepId = "github" | "slack" | "opencode" | "instabox" | "bot" | "done";

const STEPS: { id: Exclude<StepId, "done">; label: string; optional: boolean }[] = [
  { id: "github", label: "GitHub", optional: true },
  { id: "slack", label: "Slack", optional: true },
  { id: "opencode", label: "OpenCode", optional: false },
  { id: "instabox", label: "instabox", optional: false },
  { id: "bot", label: "First bot", optional: false },
];

const SKIP_KEY = "agentcall:onboarding-skipped";

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
              <span className="font-mono text-xs text-neutral-500">
                Step {index + 1} of {STEPS.length}
              </span>
            )}
          </header>

          {status && step && <Progress index={index} status={status} />}

          {status && step && (
            <div className="mt-8 hidden md:mt-10 md:block">
              <Stepper current={step} status={status} onPick={(id) => go(id)} />
            </div>
          )}

          <div className="mt-8 md:mt-10">
          <div className="relative mx-auto w-full max-w-[560px]">
              {loadError ? (
                <Banner>{loadError}</Banner>
              ) : !status || !step ? (
                <div className="grid h-80 place-items-center text-neutral-500">
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
        <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
          <motion.div
            className={`h-full rounded-full ${isDone(s.id, status) ? "bg-gold" : "bg-white/60"}`}
            initial={false}
            animate={{ width: i < index || isDone(s.id, status) ? "100%" : i === index ? "45%" : "0%" }}
            transition={{ duration: 0.5, ease }}
          />
        </div>
      ))}
    </div>
  );
}

function Stepper({ current, status, onPick }: { current: StepId; status: OnboardingStatus; onPick: (id: StepId) => void }) {
  return (
    <nav aria-label="Setup steps">
      <ol className="flex">
        {STEPS.map((s, i) => {
          const done = isDone(s.id, status);
          const active = s.id === current;
          return (
            <li key={s.id} className="relative flex-1 text-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={`absolute right-[calc(50%+22px)] left-[22px] top-[21px] h-0.5 ${
                    isDone(STEPS[i - 1]!.id, status) ? "bg-gold/50" : "bg-white/[0.08]"
                  }`}
                />
              )}
              <button
                type="button"
                aria-label={`${s.label} — step ${i + 1} of ${STEPS.length}${s.optional ? ", optional" : ""}`}
                aria-current={active ? "step" : undefined}
                onClick={() => onPick(s.id)}
                className="group w-full"
              >
                <span
                  className={`relative mx-auto grid size-11 place-items-center rounded-full border text-[13px] font-medium transition-colors ${
                    done
                      ? "border-gold/50 bg-gold/15 text-gold"
                      : active
                        ? "border-gold bg-gold text-black"
                        : "border-white/12 bg-white/[0.03] text-neutral-400 group-hover:border-white/25"
                  }`}
                >
                  {done ? <Check size={15} /> : i + 1}
                </span>
                <span className={`mt-2.5 block text-[13px] ${active ? "font-medium text-white" : "text-neutral-500 group-hover:text-neutral-300"}`}>
                  {s.label}
                  {s.optional && !done && <span className="block text-[10px] tracking-wider text-neutral-600 uppercase">optional</span>}
                </span>
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
    <Card className="p-6 sm:p-8">
      <motion.div
        initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.08 }}
        className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white"
      >
        {icon}
      </motion.div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">{title}</h1>
      <div className="mt-2 text-pretty text-[15px] leading-relaxed text-neutral-400">{description}</div>
      {children && <div className="mt-7">{children}</div>}
      {footer && <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5">{footer}</div>}
    </Card>
  );
}

function BackButton({ onBack }: { onBack?: () => void }) {
  if (!onBack) return <span />;
  return (
    <Button variant="ghost" type="button" onClick={onBack} className="-ml-3 px-3">
      <HugeiconsIcon icon={ArrowLeft01Icon} size={16} /> Back
    </Button>
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
          className="flex gap-3 text-sm text-neutral-300"
        >
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-gold/12 text-gold">
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
      className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
        <Check size={14} />
      </span>
      <div className="min-w-0 flex-1 text-sm text-emerald-100">{children}</div>
      {onChange && (
        <button type="button" onClick={onChange} className="text-[13px] font-medium text-neutral-400 hover:text-white">
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
            <Button onClick={onNext}>
              Continue <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </Button>
          ) : (
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
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
            Connected to <span className="font-medium text-white">{gh.account?.login}</span>
            <span className="text-emerald-200/60"> · {gh.account?.repositorySelection === "all" ? "all repositories" : "selected repositories"}</span>
          </Connected>
        ) : gh.available ? (
          <Button onClick={install.start} loading={install.loading} className="w-full">
            <GitHubIcon size={16} /> Install GitHub App
          </Button>
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
            <Button onClick={onNext}>
              Continue <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </Button>
          ) : (
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
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
              <span className="font-medium text-white">#{slack.channel.name}</span>
              <span className="text-emerald-200/60"> in {slack.team?.name}</span>
            </Connected>
          ) : slack.available ? (
            <Button onClick={install.start} loading={install.loading} className="w-full">
              <SlackIcon size={16} /> Add to Slack
            </Button>
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
        <HugeiconsIcon icon={Search01Icon} size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search channels"
          aria-label="Search channels"
          className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-3.5 text-[15px] text-white outline-none placeholder:text-neutral-600 focus:border-gold/60 focus:shadow-[0_0_0_4px_rgb(246_195_91_/_0.12)]"
        />
      </div>
      <div role="radiogroup" aria-label="Channels" className="max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-white/[0.06] p-1.5">
        {channels === null ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-white/[0.04]" />)
        ) : shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-neutral-500">No channels match.</p>
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
                  active ? "text-white" : "text-neutral-400 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="channel-active"
                    className="absolute inset-0 rounded-xl border border-gold/40 bg-gold/[0.08]"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative w-4 text-center text-neutral-500">
                  {c.isPrivate ? <HugeiconsIcon icon={SquareLock02Icon} size={14} /> : "#"}
                </span>
                <span className="relative flex-1 truncate">{c.name}</span>
                {c.isPrivate && !c.isMember && <span className="relative text-[11px] text-neutral-600">invite needed</span>}
              </button>
            );
          })
        )}
      </div>
      <Banner>{error}</Banner>
      <Button onClick={save} loading={saving} disabled={!selected} className="w-full">
        Use this channel
      </Button>
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
      <Input
        label={label}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        error={error}
        hint={
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon icon={SquareLock02Icon} size={12} /> Encrypted with AES-256
          </span>
        }
        autoFocus
      />
      <Button type="submit" loading={saving} disabled={value.trim().length < 8} className="w-full">
        {saving ? "Checking" : "Verify and save"}
      </Button>
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
          <a href="https://opencode.ai/auth" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-neutral-200 underline decoration-white/20 underline-offset-4 hover:text-gold">
            opencode.ai <HugeiconsIcon icon={LinkSquare02Icon} size={13} />
          </a>
          .
        </>
      }
      footer={
        <>
          <BackButton onBack={onBack} />
          {oc.connected && !replacing && (
            <Button onClick={onNext}>
              Continue <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </Button>
          )}
        </>
      }
    >
      {oc.connected && !replacing ? (
        <Connected onChange={() => setReplacing(true)}>
          Key ending in <span className="font-mono text-white">••••{oc.last4}</span> verified
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
      icon={<InstaboxIcon size={24} />}
      title="Connect instabox"
      description={
        <>
          Agents work in a cloud machine on your instabox account: they clone, test the product in a real browser and record
          repros. Create a key at{" "}
          <a href="https://instabox.sh" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-neutral-200 underline decoration-white/20 underline-offset-4 hover:text-gold">
            instabox.sh <HugeiconsIcon icon={LinkSquare02Icon} size={13} />
          </a>
          .
        </>
      }
      footer={
        <>
          <BackButton onBack={onBack} />
          {ib.connected && !replacing && (
            <Button onClick={onNext}>
              Continue <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {ib.connected && !replacing ? (
          <Connected onChange={() => setReplacing(true)}>
            <span className="font-medium text-white">{ib.workspace}</span>
            <span className="text-emerald-200/60">
              {" "}
              · {ib.plan} plan · ••••{ib.last4}
            </span>
          </Connected>
        ) : (
          <KeyForm path="/integrations/instabox" label="API key" placeholder="ibk_…" onSaved={onSaved} />
        )}
        <p className="text-[13px] leading-relaxed text-neutral-500">
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
            <Button variant="ghost" onClick={onNext}>
              I already have one
            </Button>
          )}
        </>
      }
    >
      {created ? (
        <Connected>
          <span className="font-medium text-white">{created.name}</span> is ready
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

function DoneStep({ status, onFix }: { status: OnboardingStatus; onFix: (id: StepId) => void }) {
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string>();
  const [skipped, setSkipped] = useState<string[]>([]);
  useEffect(() => setSkipped(JSON.parse(sessionStorage.getItem(SKIP_KEY) ?? "[]")), []);
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

  const rows = [
    {
      id: "github" as const,
      icon: <GitHubIcon size={16} />,
      label: "GitHub",
      why: "Repos your agents can work on",
      done: status.github.connected,
      pill: status.github.connected && status.github.account ? `Connected · ${status.github.account.login}` : null,
    },
    {
      id: "slack" as const,
      icon: <SlackIcon size={16} />,
      label: "Slack",
      why: "The channel your bots answer in",
      done: Boolean(status.slack.channel),
      pill: status.slack.channel ? `Connected · #${status.slack.channel.name}` : null,
    },
    {
      id: "opencode" as const,
      icon: <OpenCodeIcon size={16} />,
      label: "OpenCode",
      why: "The agent engine and your models",
      done: status.opencode.connected,
      pill: status.opencode.connected ? "Connected" : null,
    },
    {
      id: "instabox" as const,
      icon: <InstaboxIcon size={16} />,
      label: "instabox",
      why: "Cloud machines your agents run in",
      done: status.instabox.connected,
      pill: status.instabox.connected ? `Connected · ${status.instabox.workspace}` : null,
    },
    {
      id: "bot" as const,
      icon: <span className="text-[15px]">🤖</span>,
      label: "First bot",
      why: "Ready to be mentioned in Slack",
      done: status.bot.created,
      pill: status.bot.created ? "Created" : null,
    },
  ];

  return (
    <Card className="p-7 text-center sm:p-10">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
        className="mx-auto grid size-16 place-items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
      >
        <Check size={26} />
      </motion.div>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">
        {missing.length ? "Almost there" : "Your team just grew"}
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-pretty text-neutral-400">
        {missing.length
          ? `${missing.length === 1 ? "One connection is" : `${missing.length} connections are`} still needed before agents can pick up work. Everything else is ready.`
          : status.slack.channel
            ? `Mention @agentcall in #${status.slack.channel.name} to hand over the first task.`
            : "Hand over the first task from your dashboard."}
      </p>
      <div className="mt-7 space-y-2 text-left">
        {rows.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease, delay: 0.15 + i * 0.06 }}
            className="flex items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.015] px-4 py-3.5"
          >
            <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] border border-white/[0.08] bg-white/[0.04]">
              {r.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-white">{r.label}</span>
              <span className="block text-xs text-neutral-500">{r.why}</span>
            </span>
            {r.done && r.pill ? (
              <span className="rounded-full border border-emerald-400/35 bg-emerald-400/[0.08] px-2.5 py-1 text-[11px] text-emerald-300">
                {r.pill}
              </span>
            ) : (
              <>
                <span className="rounded-full border border-gold/35 bg-gold/[0.08] px-2.5 py-1 text-[11px] text-gold">
                  {skipped.includes(r.id) ? "Skipped" : "Not set up"}
                </span>
                <button
                  type="button"
                  onClick={() => onFix(r.id)}
                  className="text-xs font-medium text-gold transition-colors hover:text-white"
                >
                  Connect →
                </button>
              </>
            )}
          </motion.div>
        ))}
      </div>
      <Banner>{error}</Banner>
      <div className="mt-7 flex flex-col items-center gap-2.5">
        <Button onClick={missing.length ? () => onFix(missing[0]!.id) : finish} loading={finishing} className="min-w-52">
          {missing.length ? `Finish ${missing[0]!.label}` : "Open dashboard"}
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
        </Button>
        <p className="text-xs text-neutral-500">Or open the dashboard and connect the rest later.</p>
      </div>
    </Card>
  );
}
