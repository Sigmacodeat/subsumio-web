"use client";

// Einstellungen → Darstellung. Schriftgröße, Kontrast, Bewegung und Farbschema
// für diese Person auf diesem Gerät. Schrift/Kontrast/Bewegung landen in
// localStorage (`subsumio-a11y-prefs`) und wirken über data-Attribute auf
// <html> (src/app/a11y-preferences.css); das Farbschema nutzt den bestehenden
// `subsumio-theme`-Mechanismus des Dashboard-Layouts (gleicher Key, gleiches
// Ereignis) und wird hier nicht dupliziert. Ein Server-Endpunkt für
// Benutzer-Präferenzen existiert noch nicht (/api/auth/me kennt nur name +
// locale) — daher gilt die Einstellung pro Gerät.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Contrast, Eye, MoonStar, Type, Wind } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import {
  type A11yPrefs,
  type Contrast as ContrastPref,
  type FontScale,
  type Motion,
  DEFAULT_A11Y_PREFS,
  readA11yPrefs,
  writeA11yPrefs,
} from "@/lib/a11y-preferences";
import { THEME_STORAGE_KEY } from "@/lib/theme-init-script";

type ThemeChoice = "system" | "light" | "dark";

function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** Gleiche Schritte wie `useTheme().toggle` im Dashboard-Layout. */
function writeThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blockiert — nur für diese Sitzung anwenden.
  }
  const effective: "light" | "dark" =
    choice === "system"
      ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : choice;
  document.documentElement.dataset.theme = effective;
  document.querySelectorAll<HTMLElement>("[data-app='dashboard']").forEach((el) => {
    el.dataset.theme = effective;
  });
  window.dispatchEvent(new Event("subsumio:theme-change"));
}

interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

function ChoiceGroup<T extends string>({
  id,
  icon,
  legend,
  description,
  options,
  value,
  onChange,
}: {
  id: string;
  icon: React.ReactNode;
  legend: string;
  description: string;
  options: Array<Option<T>>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-[color:var(--ds-text)]">
        <span aria-hidden className="text-[color:var(--ds-text-muted)]">
          {icon}
        </span>
        {legend}
      </legend>
      <p id={`${id}-desc`} className="text-sm text-[color:var(--ds-text-muted)]">
        {description}
      </p>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-describedby={`${id}-desc`}>
        {options.map((opt) => {
          const checked = opt.value === value;
          return (
            <label
              key={opt.value}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors motion-reduce:transition-none ${
                checked
                  ? "border-[color:var(--ds-accent)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                  : "border-[color:var(--ds-control-border)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
              }`}
            >
              <input
                type="radio"
                name={id}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ds-accent)]"
              />
              <span className="flex flex-col">
                <span className="font-medium">{opt.label}</span>
                {opt.hint && (
                  <span className="text-xs text-[color:var(--ds-text-muted)]">{opt.hint}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function DarstellungSettingsPage() {
  const { t, lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);

  // Erst nach dem Mount aus dem Storage lesen — SSR kennt den Browser nicht.
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULT_A11Y_PREFS);
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const [hydrated, setHydrated] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(readA11yPrefs());
    setTheme(readThemeChoice());
    setHydrated(true);
    const sync = () => {
      setPrefs(readA11yPrefs());
      setTheme(readThemeChoice());
    };
    window.addEventListener("storage", sync);
    window.addEventListener("subsumio:theme-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("subsumio:theme-change", sync);
    };
  }, []);

  const update = useCallback(
    (patch: Partial<A11yPrefs>) => {
      const next = { ...prefs, ...patch };
      setPrefs(next);
      writeA11yPrefs(next);
      setSavedNote(
        L("Gespeichert – gilt sofort auf diesem Gerät.", "Saved – applies on this device.")
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- L hängt nur von lang ab
    [prefs, lang]
  );

  const changeTheme = (choice: ThemeChoice) => {
    setTheme(choice);
    writeThemeChoice(choice);
    setSavedNote(
      L("Gespeichert – gilt sofort auf diesem Gerät.", "Saved – applies on this device.")
    );
  };

  const reset = () => {
    setPrefs(DEFAULT_A11Y_PREFS);
    writeA11yPrefs(DEFAULT_A11Y_PREFS);
    changeTheme("system");
  };

  return (
    <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("settings.darstellung.title")}
        description={t("settings.darstellung.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("settings.title"), href: "/dashboard/settings" },
          { label: t("settings.darstellung.title") },
        ]}
      />

      <p className="text-sm text-[color:var(--ds-text-muted)]">
        {L(
          "Die Einstellungen werden in diesem Browser gespeichert und gelten sofort – ohne Neuladen. Auf einem anderen Gerät bitte erneut wählen.",
          "Settings are stored in this browser and apply immediately – no reload. Choose them again on another device."
        )}
      </p>

      <ChoiceGroup<FontScale>
        id="font-scale"
        icon={<Type size={18} />}
        legend={t("settings.darstellung.font_size")}
        description={L(
          "Vergrößert Text, Abstände und Schaltflächen gleichmäßig.",
          "Scales text, spacing and buttons together."
        )}
        value={prefs.fontScale}
        onChange={(v) => update({ fontScale: v })}
        options={[
          { value: "100", label: "100 %", hint: L("Standard", "Default") },
          { value: "112", label: "112 %", hint: L("Etwas größer", "Slightly larger") },
          { value: "125", label: "125 %", hint: L("Deutlich größer", "Much larger") },
        ]}
      />

      <ChoiceGroup<ContrastPref>
        id="contrast"
        icon={<Contrast size={18} />}
        legend={t("settings.darstellung.contrast")}
        description={L(
          "Erhöht den Kontrast von Nebentext, Rahmen und Fokusrahmen (mindestens 4,5:1 bzw. 3:1).",
          "Raises contrast of secondary text, borders and focus rings (at least 4.5:1 / 3:1)."
        )}
        value={prefs.contrast}
        onChange={(v) => update({ contrast: v })}
        options={[
          { value: "standard", label: L("Standard", "Standard") },
          { value: "high", label: L("Erhöht", "Increased") },
        ]}
      />

      <ChoiceGroup<Motion>
        id="motion"
        icon={<Wind size={18} />}
        legend={t("settings.darstellung.motion")}
        description={L(
          "Schaltet Übergänge und Animationen ab, etwa beim Öffnen von Menüs und Dialogen.",
          "Turns off transitions and animations, e.g. when menus and dialogs open."
        )}
        value={prefs.motion}
        onChange={(v) => update({ motion: v })}
        options={[
          {
            value: "system",
            label: L("System", "System"),
            hint: L("Betriebssystem-Einstellung übernehmen", "Follow the OS setting"),
          },
          {
            value: "reduce",
            label: L("An", "On"),
            hint: L("Bewegung reduzieren", "Reduce motion"),
          },
          {
            value: "allow",
            label: L("Aus", "Off"),
            hint: L("Animationen zulassen", "Allow animations"),
          },
        ]}
      />

      <ChoiceGroup<ThemeChoice>
        id="theme"
        icon={<MoonStar size={18} />}
        legend={t("settings.darstellung.theme")}
        description={L(
          "Helles oder dunkles Farbschema – derselbe Schalter wie oben in der Kopfzeile.",
          "Light or dark colour scheme – the same switch as in the top bar."
        )}
        value={theme}
        onChange={changeTheme}
        options={[
          { value: "system", label: L("System", "System") },
          { value: "light", label: L("Hell", "Light") },
          { value: "dark", label: L("Dunkel", "Dark") },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[color:var(--ds-text-muted)]" role="status" aria-live="polite">
          {hydrated && savedNote}
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--ds-control-border)] px-4 text-sm font-medium text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
        >
          <Eye size={16} aria-hidden />
          {L("Auf Standard zurücksetzen", "Reset to defaults")}
        </button>
      </div>

      <p className="text-xs text-[color:var(--ds-text-subtle)]">
        {L("Zur ", "See our ")}
        <Link href="/at/barrierefreiheit" className="underline underline-offset-2">
          {L("Barrierefreiheitserklärung", "accessibility statement")}
        </Link>
        {L(
          " – dort stehen bekannte Einschränkungen und der Feedback-Weg.",
          " – it lists known limitations and how to give feedback."
        )}
      </p>
    </div>
  );
}
