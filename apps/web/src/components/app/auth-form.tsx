"use client";

import { Key01Icon, ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { SlackIcon } from "@/components/brand-icons";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, errorMessage, type User } from "@/lib/api";
import { Banner, FieldError, ease, Spinner } from "./ui";

type Mode = "login" | "signup";

const PERKS: Record<Mode, { icon: ReactNode; title: string; body: string }[]> = {
  login: [
    {
      icon: <SlackIcon size={16} />,
      title: "They live in your Slack",
      body: "Mention a bot by name and it answers in the thread, like everyone else.",
    },
    {
      icon: <span className="text-[13px]">PR</span>,
      title: "They ship real PRs",
      body: "Clone, fix, test and open the pull request, from a machine you own.",
    },
    {
      icon: <HugeiconsIcon icon={Key01Icon} size={15} />,
      title: "Your keys stay yours",
      body: "OpenCode and instabox keys are encrypted and used only for your runs.",
    },
  ],
  signup: [
    {
      icon: <span className="text-[13px] font-semibold">1</span>,
      title: "Connect what you already use",
      body: "GitHub, Slack, OpenCode and instabox, one step each, all optional except two.",
    },
    {
      icon: <span className="text-[13px] font-semibold">2</span>,
      title: "Create your first bot",
      body: "A name, a purpose, a model. Mention it in Slack to hand over work.",
    },
    {
      icon: <span className="text-[13px] font-semibold">3</span>,
      title: "Watch it ship",
      body: "Every run reports back in the thread with a pull request and a recording.",
    },
  ],
};

/** The brand rail of the two-panel auth layout. Hidden on small screens. */
function BrandRail({ mode }: { mode: Mode }) {
  return (
    <aside className="relative hidden w-[560px] shrink-0 flex-col justify-between border-r border-border p-14 lg:flex">
      <div>
        <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-foreground">
          <Logo size={32} />
          agentcall
        </Link>
        <h1 className="mt-8 max-w-[420px] text-[34px] font-semibold leading-[1.15] tracking-tight text-foreground">
          {mode === "login" ? "Agents that work like teammates." : "Your agents are a few steps away."}
        </h1>
        <p className="mt-3 max-w-[380px] text-[15px] leading-relaxed text-muted-foreground">
          {mode === "login"
            ? "AI agents join your Slack, take client issues, record the repro and open the pull request."
            : "Create an account, connect your tools, and the first bot is working in about five minutes."}
        </p>
        <div className="mt-9 space-y-6">
          {PERKS[mode].map((perk) => (
            <div key={perk.title} className="flex items-start gap-4">
              <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] border border-border bg-card text-primary">
                {perk.icon}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{perk.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{perk.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Keys encrypted with AES-256 · Agents run in your instabox cloud · Open source
      </p>
    </aside>
  );
}

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  trailing?: ReactNode;
} & Omit<ComponentProps<typeof Input>, "id">;

function Field({ label, hint, error, trailing, ...props }: FieldProps) {
  const autoId = useId();
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <Label htmlFor={autoId} className="items-baseline">
          {label}
        </Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="relative">
        <Input id={autoId} aria-invalid={Boolean(error)} className={cn(trailing && "pr-10")} {...props} />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      <FieldError message={error} />
    </div>
  );
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [banner, setBanner] = useState<string>();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    setBanner(undefined);
    try {
      const { user } = await api<{ user: User }>(`/auth/${mode}`, {
        body: Object.fromEntries(form.entries()),
      });
      const next = params.get("next");
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : user.onboarded ? "/dashboard" : "/onboarding");
    } catch (err) {
      setLoading(false);
      if (err instanceof ApiError && err.code === "validation_failed") setError(err);
      else setBanner(errorMessage(err));
    }
  };

  const signup = mode === "signup";
  return (
    <main className="relative flex min-h-dvh overflow-hidden">
      <Backdrop />
      <BrandRail mode={mode} />
      <div className="relative flex flex-1 items-center justify-center px-5 py-12">
        <motion.div
          initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease }}
          className="w-full max-w-[400px]"
        >
          <Link href="/" className="mx-auto mb-8 flex w-fit items-center gap-2.5 text-sm font-semibold tracking-tight lg:hidden">
            <Logo size={32} />
            agentcall
          </Link>
          <Card className="p-7 sm:p-8">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">{signup ? "Create your account" : "Welcome back"}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {signup ? "Name, email, password. That's the whole form." : "Sign in to your agents."}
            </p>
          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            {signup && (
              <Field label="Name" name="name" autoComplete="name" placeholder="Ada Lovelace" required error={error?.field("name")} autoFocus />
            )}
            <Field
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
              error={error?.field("email")}
              autoFocus={!signup}
            />
            <Field
              label="Password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder={signup ? "At least 8 characters" : "••••••••"}
              hint={signup ? "8+ characters, hashed with argon2id." : undefined}
              required
              minLength={signup ? 8 : undefined}
              error={error?.field("password")}
              trailing={
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  <HugeiconsIcon icon={show ? ViewOffSlashIcon : ViewIcon} size={18} />
                </button>
              }
            />
            <Banner>{banner}</Banner>
            <Button type="submit" disabled={loading} size="lg" className="relative mt-2 w-full">
              <span className={`inline-flex items-center gap-2 transition-opacity ${loading ? "opacity-0" : ""}`}>
                {signup ? "Create account" : "Sign in"}
              </span>
              {loading && <Spinner size={16} className="absolute" />}
            </Button>
          </form>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {signup ? "Already have an account? " : "New to agentcall? "}
          <Link
            href={`${signup ? "/login" : "/signup"}${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}
            className="font-medium text-foreground transition-colors hover:text-primary"
          >
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </motion.div>
      </div>
    </main>
  );
}

/** The faint glow of the landing page's black hole, behind auth and onboarding. */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
      <div className="absolute left-1/2 top-[-30vmin] size-[110vmin] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(246_195_91_/_0.10),rgb(232_137_44_/_0.04)_45%,transparent_72%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255_/_0.035)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_top,#000_20%,transparent_70%)]" />
    </div>
  );
}
