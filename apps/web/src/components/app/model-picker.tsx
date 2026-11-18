"use client";

import { ArrowRight01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Model } from "@/lib/api";
import { Check, ease } from "./ui";

export const PROVIDER_LABELS: Record<string, string> = {
  opencode: "OpenCode",
  "opencode-go": "OpenCode Go",
};

/**
 * Searchable model picker. Model ids are provider-qualified ("opencode/go
 * routes"), so same-named models from different providers stay distinct and
 * are grouped under their provider.
 */
export function ModelPicker({ models, value, onChange }: { models: Model[] | null; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const selected = models?.find((m) => m.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    search.current?.focus();
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { provider: string; label: string; models: Model[] }[] = [];
    for (const m of models ?? []) {
      if (q && !m.name.toLowerCase().includes(q) && !m.id.toLowerCase().includes(q)) continue;
      let group = out.find((g) => g.provider === m.provider);
      if (!group) out.push((group = { provider: m.provider, label: PROVIDER_LABELS[m.provider] ?? m.provider, models: [] }));
      group.models.push(m);
    }
    for (const g of out) g.models.sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
    return out;
  }, [models, query]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-left text-[15px] text-white outline-none transition focus:border-gold/60 focus:shadow-[0_0_0_4px_rgb(246_195_91_/_0.12)]"
      >
        <span className="truncate">
          {selected ? `${selected.name}${selected.free ? " · free" : ""}` : value}
        </span>
        <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="shrink-0 rotate-90 text-neutral-500" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.16, ease }}
            className="absolute left-0 top-12 z-20 w-full origin-top rounded-2xl border border-white/10 bg-neutral-950 p-2 shadow-2xl"
          >
            <div className="relative">
              <input
                ref={search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const first = groups.flatMap((g) => g.models)[0];
                    if (first) pick(first.id);
                  }
                }}
                placeholder="Search models…"
                className="h-9 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-8 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-gold/60"
              />
              <HugeiconsIcon icon={Search01Icon} size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            </div>
            <div className="mt-2 max-h-72 overflow-y-auto">
              {models === null ? (
                <div className="flex gap-2 p-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-8 w-28 animate-pulse rounded-xl bg-white/[0.05]" />
                  ))}
                </div>
              ) : groups.length === 0 ? (
                <p className="p-3 text-sm text-neutral-500">No models match “{query.trim()}”.</p>
              ) : (
                groups.map((g) => (
                  <div key={g.provider} className="mb-1 last:mb-0">
                    <p className="px-2 pb-1 pt-2 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase first:pt-1">
                      {g.label}
                    </p>
                    {g.models.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => pick(m.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-white/10 ${
                          m.id === value ? "bg-white/10" : ""
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-white">{m.name}</span>
                          <span className="block truncate font-mono text-[11px] text-neutral-500">{m.id}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {m.free && (
                            <span className="rounded-full border border-emerald-400/30 px-1.5 py-0.5 text-[10px] text-emerald-300">free</span>
                          )}
                          {m.id === value && <Check size={14} className="text-gold" />}
                        </span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
