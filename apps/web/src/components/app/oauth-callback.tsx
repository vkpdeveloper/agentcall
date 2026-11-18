"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GitHubIcon, SlackIcon } from "@/components/brand-icons";
import { api, errorMessage } from "@/lib/api";
import { Backdrop } from "./auth-form";
import { Button, Card, Check, ease, Spinner } from "./ui";

type Provider = "github" | "slack";

export const RETURN_KEY = "agentcall:return-to";

/** Finishes an OAuth/app-install round trip, then returns to onboarding. */
export function OAuthCallback({ provider }: { provider: Provider }) {
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<{ kind: "working" } | { kind: "done"; label: string } | { kind: "error"; message: string }>({
    kind: "working",
  });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // strict mode: the code is single use
    ran.current = true;
    const returnTo = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    // Slack always lands on the channel picker; GitHub goes back where it started.
    const target = provider === "github" && returnTo === "/dashboard" ? "/dashboard" : "/onboarding?step=slack";

    const run = async () => {
      if (params.get("error")) throw new Error(params.get("error_description") ?? "The connection was cancelled.");
      if (provider === "github") {
        if (params.get("setup_action") === "request") {
          throw new Error("Your organization needs to approve the agentcall app first. You'll be able to connect once it does.");
        }
        if (!params.get("installation_id") || !params.get("state")) {
          throw new Error("The connection was cancelled before it finished. Start it again from setup.");
        }
        const { account } = await api<{ account: { login: string } }>("/integrations/github/complete", {
          body: { installationId: params.get("installation_id"), code: params.get("code") ?? undefined, state: params.get("state") },
        });
        return `Connected to ${account.login}`;
      }
      if (!params.get("code") || !params.get("state")) {
        throw new Error("The connection was cancelled before it finished. Start it again from setup.");
      }
      const { team } = await api<{ team: { name: string } }>("/integrations/slack/complete", {
        body: { code: params.get("code"), state: params.get("state") },
      });
      return `Connected to ${team.name}`;
    };

    run()
      .then((label) => {
        setState({ kind: "done", label });
        setTimeout(() => router.replace(target), 900);
      })
      .catch((e) => setState({ kind: "error", message: errorMessage(e) }));
  }, [params, provider, router]);

  const Icon = provider === "github" ? GitHubIcon : SlackIcon;
  return (
    <main className="relative grid min-h-dvh place-items-center px-5">
      <Backdrop />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
        className="relative w-full max-w-sm"
      >
        <Card className="flex flex-col items-center p-8 text-center">
          <div className="relative grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <Icon size={26} />
            <span
              className={`absolute -bottom-1.5 -right-1.5 grid size-6 place-items-center rounded-full border-2 border-black ${
                state.kind === "done" ? "bg-emerald-400 text-black" : state.kind === "error" ? "bg-red-400 text-black" : "bg-neutral-800 text-white"
              }`}
            >
              {state.kind === "done" ? <Check size={12} /> : state.kind === "error" ? "!" : <Spinner size={12} />}
            </span>
          </div>
          <h1 className="mt-6 text-lg font-semibold text-white">
            {state.kind === "working" ? `Connecting ${provider === "github" ? "GitHub" : "Slack"}…` : state.kind === "done" ? state.label : "Couldn't connect"}
          </h1>
          {state.kind === "error" && (
            <>
              <p className="mt-2 text-sm text-neutral-400">{state.message}</p>
              <Link href={`/onboarding?step=${provider}`} className="mt-6">
                <Button variant="secondary">Back to setup</Button>
              </Link>
            </>
          )}
        </Card>
      </motion.div>
    </main>
  );
}
