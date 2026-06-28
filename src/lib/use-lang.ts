"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lang } from "@/content/site";
import { HREFLANG } from "@/content/site";
import { createT, type TFunc } from "@/content/dashboard";
export type { TFunc };
import { useMe } from "@/lib/queries/auth";
import { useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/csrf";

const LANG_EVENT = "dashboard-lang-change";

/**
 * Detects the dashboard language with this priority:
 *  1. localStorage("dashboard-lang") — explicit user override
 *  2. user profile `.locale` field (if present)
 *  3. <html lang> attribute (set by LangSetter based on route)
 *  4. fallback: "de" (preserving existing German strings)
 *
 * Returns `{ lang, t, setLang }` where `t(key)` looks up a bilingual string
 * and falls back to German if the English entry is missing.
 * `setLang(newLang)` switches the language live, persists to localStorage,
 * updates `<html lang>`, and fires a custom event so all `useLang` instances
 * re-render. It also PATCHes the user profile on the server.
 */
export function useLang(): { lang: Lang; t: TFunc; setLang: (lang: Lang) => void } {
  const [lang, setLangState] = useState<Lang>("de");
  const meQuery = useMe();
  const qc = useQueryClient();

  useEffect(() => {
    // 1. localStorage override
    try {
      const stored = localStorage.getItem("dashboard-lang");
      if (stored === "en" || stored === "de" || stored === "at" || stored === "ch") {
        setLangState(stored);
        return;
      }
    } catch {}

    // 2. user profile locale
    const profileLang = meQuery.data?.user?.locale;
    if (
      profileLang === "en" ||
      profileLang === "de" ||
      profileLang === "at" ||
      profileLang === "ch"
    ) {
      setLangState(profileLang as Lang);
      return;
    }

    // 3. <html lang> attribute
    const htmlLang = document.documentElement.lang;
    if (htmlLang === "de" || htmlLang === "de-AT" || htmlLang === "de-CH") {
      setLangState(htmlLang === "de-AT" ? "at" : htmlLang === "de-CH" ? "ch" : "de");
      return;
    }
    if (htmlLang === "en") {
      setLangState("en");
      return;
    }

    // 4. fallback
    setLangState("de");
  }, [meQuery.data]);

  // Listen for cross-component language changes
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Lang>).detail;
      if (detail === "en" || detail === "de" || detail === "at" || detail === "ch") {
        setLangState(detail);
      }
    };
    window.addEventListener(LANG_EVENT, handler);
    return () => window.removeEventListener(LANG_EVENT, handler);
  }, []);

  const setLang = useCallback(
    (newLang: Lang) => {
      setLangState(newLang);
      setDashboardLang(newLang);
      window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: newLang }));

      // Persist to server profile
      csrfFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLang }),
      })
        .then(() => qc.invalidateQueries({ queryKey: ["auth", "me"] }))
        .catch((err) =>
          console.warn(
            "[use-lang] Failed to persist locale:",
            err instanceof Error ? err.message : err
          )
        );
    },
    [qc]
  );

  const t = useMemo(() => createT(lang), [lang]);
  return { lang, t, setLang };
}

/** Set the dashboard language and persist to localStorage. */
export function setDashboardLang(lang: Lang) {
  try {
    localStorage.setItem("dashboard-lang", lang);
  } catch {}
  if (typeof document !== "undefined") {
    document.documentElement.lang = HREFLANG[lang] || lang;
  }
}
