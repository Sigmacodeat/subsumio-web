import Link from "next/link";
import { ArrowRight, Scale, UserRound } from "lucide-react";
import { audienceCopy, type Audience } from "@/content/audiences";
import { p, type Lang } from "@/content/site";

export function AudienceSwitcher({
  lang,
  active,
  compact = false,
}: {
  lang: Lang;
  active?: Audience;
  compact?: boolean;
}) {
  const copy = audienceCopy(lang);
  const items = [
    { id: "private" as const, icon: UserRound },
    { id: "professional" as const, icon: Scale },
  ];

  return (
    <div
      className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2"
      aria-label={lang === "en" ? "Choose access" : "Zugang wählen"}
    >
      {items.map(({ id, icon: Icon }) => {
        const item = copy[id];
        const selected = active === id;
        return (
          <Link
            key={id}
            href={p(lang, item.href)}
            aria-current={selected ? "page" : undefined}
            className={`group rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg ${
              selected
                ? "brand-border brand-soft shadow-sm"
                : "[border-color:var(--mk-border)] [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)]"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="brand-soft brand-border flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border">
                <Icon className="brand-text" size={20} />
              </div>
              <div className="min-w-0">
                <p className="brand-text text-sm font-semibold">{item.eyebrow}</p>
                <h3 className="mt-1 text-lg font-semibold [color:var(--mk-text)]">{item.title}</h3>
                {!compact && (
                  <p className="mt-2 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {item.description}
                  </p>
                )}
                <span className="brand-text mt-3 inline-flex items-center gap-1 text-sm font-semibold">
                  {item.cta}
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
