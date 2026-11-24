/**
 * Sapludu — lightweight i18n (i18next-equivalent).
 * EN/BN dictionaries + Zustand-backed language selection, persisted per user/device.
 */
"use client";

import { useUiStore } from "@/stores/ui-store";
import { bn } from "./bn";
import { en, type TranslationKey } from "./en";

export type Language = "en" | "bn";
export type { TranslationKey };

const dicts: Record<Language, Partial<Record<TranslationKey, string>>> = {
  en,
  bn,
};

/** Resolve a translation key for a language (falls back to English, then the key itself). */
export function translate(lang: Language, key: TranslationKey): string {
  const d = dicts[lang] ?? {};
  return d[key] ?? en[key] ?? key;
}

/** React hook: returns a bound translation function for the current language. */
export function useT() {
  const lang = useUiStore((s) => s.language);
  return (key: TranslationKey) => translate(lang, key);
}

export function formatDate(d: Date | string, lang: Language): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatNumber(n: number, lang: Language): string {
  return n.toLocaleString(lang === "bn" ? "bn-BD" : "en-US");
}
