"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/content/site";
import { createT, type TFunc } from "@/content/dashboard";
import { useMe } from "@/lib/queries/auth";

/**
 * Detects the dashboard language with this priority:
 *  1. localStorage("dashboard-lang") — explicit user override
 *  2. user profile `.language` field (if present)
 *  3. <html lang> attribute (set by LangSetter based on route)
 *  4. fallback: "de" (preserving existing German strings)
 *
 * Returns `{ lang, t }` where `t(key)` looks up a bilingual string
 * and falls back to German if the English entry is missing.
 */
export function useLang(): { lang: Lang; t: TFunc } {
  const [lang, setLang] = useState<Lang>("de");
  const meQuery = useMe();

  useEffect(() => {
    // 1. localStorage override
    try {
      const stored = localStorage.getItem("dashboard-lang");
      if (stored === "en" || stored === "de") {
        setLang(stored);
        return;
      }
    } catch {}

    // 2. user profile language
    const profileLang = meQuery.data?.user?.language;
    if (profileLang === "en" || profileLang === "de") {
      setLang(profileLang as Lang);
      return;
    }

    // 3. <html lang> attribute
    const htmlLang = document.documentElement.lang;
    if (htmlLang === "de") {
      setLang("de");
      return;
    }
    if (htmlLang === "en") {
      setLang("en");
      return;
    }

    // 4. fallback
    setLang("de");
  }, [meQuery.data]);

  const t = createT(lang);
  return { lang, t };
}

/** Set the dashboard language and persist to localStorage. */
export function setDashboardLang(lang: Lang) {
  try {
    localStorage.setItem("dashboard-lang", lang);
  } catch {}
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}
