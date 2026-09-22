"use client";

// Subsumio premium showcase — the agency-level presentation of the law-firm
// product: a WhatsApp-Copilot spotlight (an optional convenience channel) and a
// bento-style feature grid that surfaces every capability without a flat wall of cards.
// Content is sourced from VERTICALS.legal so copy stays single-source +
// SEO-indexable; this file owns only the presentation + motion.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";
import {
  Paperclip,
  Mic,
  Clock,
  CalendarClock,
  Check,
  CheckCheck,
  FileText,
  ArrowRight,
  ChevronLeft,
  Video,
  Phone,
  Camera,
  Signal,
  Wifi,
  BatteryFull,
  Smile,
  Send,
} from "lucide-react";
import { Section, H2_CTA_CLASS, EYEBROW_CLASS } from "./primitives";
import { ICONS, accentTile } from "./icons";
import { VERTICALS } from "@/content/verticals";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { EASE } from "./motion-system";
import Link from "next/link";
import { useMarket } from "@/lib/use-market";

const COPY = {
  waEyebrow: "Das Büro in der Hosentasche",
  waTitle: "Immer dabei — Fristen im Blick, auch unterwegs",
  waSub:
    "Subsumio ist Ihr Sekretariat für unterwegs: Zeiten buchen, Belege ablegen, Fristen im Blick — alles über WhatsApp, ohne App-Wechsel.",
  waPoints: [
    {
      icon: Clock,
      color: "emerald",
      t: "Zeit & Auslagen in Sekunden",
      d: "„Zeit 0,5 h Akte Müller, Telefonat“ wird erfasst und der Akte zugeordnet; ein Tipp bestätigt.",
    },
    {
      icon: Paperclip,
      color: "amber",
      t: "Beleg-Foto → richtige Akte",
      d: "Ein Foto oder Dokument mit Aktenkürzel in der Bildunterschrift wird in der richtigen Akte abgelegt.",
    },
    {
      icon: Mic,
      color: "violet",
      t: "Sprachnotiz unterwegs",
      d: "Diktat nach dem Termin — transkribiert und der Akte angehängt, bevor Sie im Büro sind.",
    },
    {
      icon: CalendarClock,
      color: "rose",
      t: "Fristen, die Sie nicht vergessen",
      d: "Tägliche Übersicht, Feiertage berücksichtigt, Fristen mit Rechtsgrundlage berechnet. Die Verantwortung bleibt bei Ihnen — Subsumio erinnert.",
    },
  ],
  phoneHeader: "Subsumio-Assistent",
  phoneStatus: "online",
  phoneNotice: "Unternehmenskonto Ihrer Kanzlei — Nachrichten werden der Akte zugeordnet.",
  chat: [
    { from: "user", text: "Zeit 0,5 h Akte Müller, Telefonat Gegenseite" },
    {
      from: "bot",
      text: "✓ Zeitbuchung 0,5 h · Akte Müller · Telefonat\nBestätigen?",
      chips: ["Bestätigen", "Ändern"],
    },
    {
      from: "user",
      text: "Frage: Wo widersprechen sich die Aussagen der Gegenseite?",
      file: "Schriftsatz_Gegenseite.pdf",
    },
    {
      from: "bot",
      text: "3 Widersprüche gefunden — mit Fundstellen (S. 14, Beilage ./7, Protokoll vom 12.03.). Antwort in der Akte abgelegt.",
    },
    { from: "user", text: "Welche Fristen laufen diese Woche ab?" },
    {
      from: "bot",
      text: "3 Fristen: ⚠️ Rekurs Bauer heute, Klagebeantwortung Müller am Donnerstag, Berufung Schmidt am Freitag. Alle mit der Akte verknüpft.",
    },
  ],
  bentoEyebrow: "Alle Funktionen",
  bentoTitle: "Alles, was die Kanzlei braucht — in einem System",
  bentoSub: "EU-Cloud oder On-Premise im Enterprise-Tarif. Jede Antwort mit Fundstelle.",
} as const;

const reveal = (i: number, reduce = false) => ({
  initial: reduce ? false : { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: {
    duration: 0.5,
    delay: Math.min(i * 0.06, 0.4),
    ease: EASE.spring,
  },
});

function TypingDots({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
          animate={{ y: [0, -2.5, 0], opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            delay: i * 0.18,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function PhoneCopilot() {
  const { ui: UI_STRINGS } = useMarket();
  const c = COPY;
  const reduce = useReducedMotion() ?? false;
  const WA = {
    bg: "#0b141a",
    header: "#1f2c34",
    incoming: "#1f2c34",
    outgoing: "#005c4b",
    text: "#e9edef",
    // WhatsApp's own meta grey is #8696a0 and only reaches 2.6:1 on the chat
    // background — too faint to read in a marketing mock. Same character,
    // enough contrast.
    meta: "#a7b7c0",
    /** Meta text on the green outgoing bubble — the neutral grey only makes
     *  3.9:1 there. */
    metaOnOutgoing: "#cfe6de",
    read: "#53a9c6",
    accent: "#25d366",
    input: "#1f2c34",
    inputField: "#2a3b45",
  } as const;

  const chat = useMemo(() => c.chat.slice(0, 6), [c]);
  const times = ["14:02", "14:02", "14:03", "14:04", "14:05", "14:06"] as const;

  const [visibleCount, setVisibleCount] = useState(reduce ? chat.length : 0);
  const [isTyping, setIsTyping] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [tappedChip, setTappedChip] = useState<number | null>(null);
  const [readStatus, setReadStatus] = useState<Record<number, "sent" | "delivered" | "read">>({});
  const [fadingOut, setFadingOut] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputViewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce) {
      setVisibleCount(chat.length);
      setReadStatus(Object.fromEntries(chat.map((_, i) => [i, "read"])));
      return;
    }

    let mounted = true;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const scheduleSequence = () => {
      let elapsed = 800;

      chat.forEach((msg, i) => {
        const isBot = msg.from === "bot";

        if (isBot) {
          // Bot typing indicator
          timeouts.push(
            setTimeout(() => {
              if (mounted) setIsTyping(true);
            }, elapsed)
          );

          const typingDuration = 1600 + Math.min(msg.text.length * 12, 1000);
          elapsed += typingDuration;

          // Bot message appears
          timeouts.push(
            setTimeout(() => {
              if (mounted) {
                setIsTyping(false);
                setVisibleCount(i + 1);
              }
            }, elapsed)
          );

          elapsed += 700;

          // Chip tap simulation — the user confirms; the chip stays confirmed
          // until the loop resets (a booking that un-confirms itself reads wrong).
          if ("chips" in msg && msg.chips) {
            timeouts.push(
              setTimeout(() => {
                if (mounted) setTappedChip(0);
              }, elapsed)
            );

            elapsed += 1200;
          }
        } else {
          // User starts typing in input bar
          timeouts.push(
            setTimeout(() => {
              if (mounted) setIsUserTyping(true);
            }, elapsed)
          );

          // Type out text character by character
          const text = msg.text;
          const typeSpeed = 28;
          const typingDuration = text.length * typeSpeed;

          for (let j = 1; j <= text.length; j++) {
            timeouts.push(
              setTimeout(
                () => {
                  if (mounted) setInputText(text.slice(0, j));
                },
                elapsed + j * typeSpeed
              )
            );
          }

          elapsed += typingDuration + 500;

          // Send: clear input, show message, set read status to "sent"
          timeouts.push(
            setTimeout(() => {
              if (mounted) {
                setIsUserTyping(false);
                setInputText("");
                setVisibleCount(i + 1);
                setReadStatus((prev) => ({ ...prev, [i]: "sent" }));
              }
            }, elapsed)
          );

          // Read receipt progression: sent → delivered (double gray check)
          timeouts.push(
            setTimeout(() => {
              if (mounted) setReadStatus((prev) => ({ ...prev, [i]: "delivered" }));
            }, elapsed + 600)
          );

          // delivered → read (double blue check)
          timeouts.push(
            setTimeout(() => {
              if (mounted) setReadStatus((prev) => ({ ...prev, [i]: "read" }));
            }, elapsed + 1400)
          );

          elapsed += 2000;
        }
      });

      // Fade-out 400ms before reset
      timeouts.push(
        setTimeout(() => {
          if (mounted) setFadingOut(true);
        }, elapsed + 3600)
      );

      // Loop: reset after 4s pause (messages already faded out)
      timeouts.push(
        setTimeout(() => {
          if (mounted) {
            setVisibleCount(0);
            setIsTyping(false);
            setInputText("");
            setIsUserTyping(false);
            setTappedChip(null);
            setReadStatus({});
            setFadingOut(false);
            timeouts.push(
              setTimeout(() => {
                if (mounted) scheduleSequence();
              }, 400)
            );
          }
        }, elapsed + 4000)
      );
    };

    scheduleSequence();

    return () => {
      mounted = false;
      timeouts.forEach(clearTimeout);
    };
  }, [reduce, chat]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [visibleCount, isTyping]);

  // The input keeps a fixed height of two lines and scrolls to the caret, the
  // way a real input does once the text no longer fits. Letting it grow made
  // the phone — and with it the whole section and everything below — move down
  // by about 50 px while the demo typed.
  useEffect(() => {
    const el = inputViewRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [inputText]);

  const typingLabel = UI_STRINGS.typingLabel;

  return (
    <div className="relative mx-auto w-[290px] sm:w-[330px]" aria-hidden="true">
      {/* Soft brand halo — lifts the device off the dark band without a hard glow. */}
      <div
        className="pointer-events-none absolute -inset-x-16 -inset-y-10 -z-10 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--brand-glow), transparent)" }}
      />

      {/* Hardware buttons — action + volume left, power right */}
      <div className="absolute top-[104px] -left-[3px] h-6 w-[4px] rounded-l-sm bg-[#2c2c31]" />
      <div className="absolute top-[150px] -left-[3px] h-11 w-[4px] rounded-l-sm bg-[#2c2c31]" />
      <div className="absolute top-[206px] -left-[3px] h-11 w-[4px] rounded-l-sm bg-[#2c2c31]" />
      <div className="absolute top-[170px] -right-[3px] h-[70px] w-[4px] rounded-r-sm bg-[#2c2c31]" />

      {/* iPhone frame — a brushed-metal rim around a black bezel */}
      <div className="relative rounded-[3.1rem] bg-gradient-to-b from-[#55555c] via-[#26262b] to-[#44444b] p-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.7),0_40px_80px_-20px_rgba(0,0,0,0.65)]">
        <div className="relative overflow-hidden rounded-[3rem] bg-black p-[8px]">
          {/* Dynamic Island */}
          <div className="absolute top-[18px] left-1/2 z-30 h-[24px] w-[84px] -translate-x-1/2 rounded-full bg-black">
            <div className="absolute top-1/2 right-2.5 h-2 w-2 -translate-y-1/2 rounded-full bg-[#15151a]" />
          </div>

          {/* Screen */}
          <div className="relative overflow-hidden rounded-[2.5rem] bg-[#0b141a]">
            {/* iOS status bar */}
            <div
              className="absolute inset-x-0 top-0 z-20 flex h-[44px] items-center justify-between px-7 text-[12px] font-semibold"
              style={{ color: WA.text }}
            >
              <span className="tabular-nums">{times[times.length - 1]}</span>
              <span className="flex items-center gap-1">
                <Signal size={12} strokeWidth={2.5} />
                <Wifi size={12} strokeWidth={2.5} />
                <BatteryFull size={16} strokeWidth={2} />
              </span>
            </div>

            {/* WhatsApp header */}
            <div className="relative z-10 flex items-center gap-2 bg-[#1f2c34] px-2.5 pt-[48px] pb-2.5">
              <ChevronLeft size={22} className="-mr-1" style={{ color: WA.text }} />
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[#2a3b45]">
                <div className="absolute inset-0 flex items-center justify-center">
                  <SubsumioMark size={16} className="text-white" />
                </div>
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-semibold" style={{ color: WA.text }}>
                  {c.phoneHeader}
                </p>
                <p className="text-[11px]" style={{ color: isTyping ? WA.text : WA.accent }}>
                  {isTyping ? typingLabel : c.phoneStatus}
                </p>
              </div>
              <div className="flex items-center gap-5 pr-1.5" style={{ color: WA.text }}>
                <Video size={19} strokeWidth={1.75} className="hidden sm:block" />
                <Phone size={17} strokeWidth={1.75} />
              </div>
            </div>

            {/* Messages — auto-scrolling, hidden scrollbar */}
            <div
              ref={scrollRef}
              className="relative z-10 h-[400px] space-y-2 overflow-y-auto px-3 py-3 transition-opacity duration-500 ease-in-out sm:h-[450px] [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none", opacity: fadingOut ? 0 : 1 }}
            >
              {/* Day chip + business notice are always there, so the chat never
                sits empty between loops. */}
              <div className="flex flex-col items-center gap-2 pb-1">
                <span
                  className="rounded-md px-2 py-1 text-[10px] font-medium"
                  style={{ background: "#1e2a31", color: WA.meta }}
                >
                  {UI_STRINGS.todayLabel}
                </span>
                <span
                  className="max-w-[85%] rounded-lg px-2.5 py-1.5 text-center text-[10px] leading-snug"
                  style={{ background: "#1e2a31", color: WA.meta }}
                >
                  {c.phoneNotice}
                </span>
              </div>

              {chat.slice(0, visibleCount).map((m, i) => {
                const isUser = m.from === "user";
                return (
                  <div key={i}>
                    <motion.div
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: EASE.out }}
                      className={isUser ? "flex justify-end" : "flex justify-start"}
                    >
                      <div
                        className="relative max-w-[86%] px-2.5 pt-1.5 pb-1 text-[13px] leading-[1.35]"
                        style={{
                          background: isUser ? WA.outgoing : WA.incoming,
                          color: WA.text,
                          borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                          boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
                        }}
                      >
                        {/* WhatsApp-style curved message tail */}
                        <span
                          className="absolute bottom-0 h-3.5 w-2"
                          style={{ [isUser ? "right" : "left"]: "-5px" }}
                        >
                          <svg
                            className="h-full w-full"
                            viewBox="0 0 8 13"
                            fill={isUser ? WA.outgoing : WA.incoming}
                            preserveAspectRatio="none"
                          >
                            <path
                              d={
                                isUser ? "M0 0C0 7 3.5 11 8 13L0 13Z" : "M8 0C8 7 4.5 11 0 13L8 13Z"
                              }
                            />
                          </svg>
                        </span>
                        <div className="whitespace-pre-line">
                          {m.text}
                          {/* Inline spacer — only takes space on the last text line,
                            so the timestamp doesn't overlap. WhatsApp does the same. */}
                          {!("file" in m && m.file) && !("chips" in m && m.chips) && (
                            <span
                              className="ml-1 inline-block w-12 align-bottom select-none"
                              aria-hidden="true"
                            >
                              {"\u200B"}
                            </span>
                          )}
                        </div>

                        {"file" in m && m.file && (
                          <div className="mt-2 flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#2a3b45]">
                              <FileText size={16} style={{ color: WA.accent }} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-medium">{m.file}</p>
                              <p
                                className="text-[10px]"
                                style={{ color: isUser ? WA.metaOnOutgoing : WA.meta }}
                              >
                                PDF · 1.2 MB
                              </p>
                            </div>
                          </div>
                        )}

                        {"chips" in m && m.chips && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {m.chips.map((ch, idx) => {
                              const isConfirmed = tappedChip === idx;
                              return (
                                <motion.span
                                  key={ch}
                                  animate={isConfirmed ? { scale: [1, 0.97, 1] } : { scale: 1 }}
                                  transition={{ duration: 0.3 }}
                                  className="rounded-full px-3 py-1 text-[11px] font-semibold"
                                  style={{
                                    background: isConfirmed
                                      ? WA.accent
                                      : idx === 0
                                        ? WA.accent
                                        : "transparent",
                                    color: idx === 0 || isConfirmed ? "#0b0f1a" : WA.text,
                                    border:
                                      idx === 0 && !isConfirmed ? "none" : `1px solid ${WA.meta}40`,
                                    opacity: isConfirmed ? 1 : tappedChip !== null ? 0.4 : 1,
                                  }}
                                >
                                  {isConfirmed && idx === 0 ? (
                                    <span className="flex items-center gap-1">
                                      <Check size={11} strokeWidth={3} />
                                      {UI_STRINGS.confirmedLabel}
                                    </span>
                                  ) : (
                                    ch
                                  )}
                                </motion.span>
                              );
                            })}
                          </div>
                        )}

                        {/* timestamp + progressive read receipts.
                          For plain text: absolute at bottom-right (spacer reserves space).
                          For file/chips: in-flow below the attachment. */}
                        {("file" in m && m.file) || ("chips" in m && m.chips) ? (
                          <div className="mt-1 flex items-center justify-end gap-0.5">
                            <span
                              className="text-[10px]"
                              style={{ color: isUser ? WA.metaOnOutgoing : WA.meta }}
                            >
                              {times[i] ?? ""}
                            </span>
                            {isUser && readStatus[i] === "sent" && (
                              <Check size={11} style={{ color: WA.metaOnOutgoing }} />
                            )}
                            {isUser && readStatus[i] === "delivered" && (
                              <CheckCheck size={11} style={{ color: WA.metaOnOutgoing }} />
                            )}
                            {isUser && readStatus[i] === "read" && (
                              <CheckCheck size={11} style={{ color: WA.read }} />
                            )}
                          </div>
                        ) : (
                          <div className="absolute right-1.5 bottom-0.5 flex items-center gap-0.5">
                            <span
                              className="text-[10px]"
                              style={{ color: isUser ? WA.metaOnOutgoing : WA.meta }}
                            >
                              {times[i] ?? ""}
                            </span>
                            {isUser && readStatus[i] === "sent" && (
                              <Check size={11} style={{ color: WA.metaOnOutgoing }} />
                            )}
                            {isUser && readStatus[i] === "delivered" && (
                              <CheckCheck size={11} style={{ color: WA.metaOnOutgoing }} />
                            )}
                            {isUser && readStatus[i] === "read" && (
                              <CheckCheck size={11} style={{ color: WA.read }} />
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                );
              })}

              {/* WhatsApp typing indicator */}
              <AnimatePresence>
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.25, ease: EASE.out }}
                    className="flex justify-start"
                  >
                    <div
                      className="relative max-w-[60%] rounded-[12px_12px_12px_4px] px-2 py-0.5"
                      style={{
                        background: WA.incoming,
                        boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
                      }}
                    >
                      <span className="absolute bottom-0 h-3.5 w-2" style={{ left: "-5px" }}>
                        <svg
                          className="h-full w-full"
                          viewBox="0 0 8 13"
                          fill={WA.incoming}
                          preserveAspectRatio="none"
                        >
                          <path d="M8 0C8 7 4.5 11 0 13L8 13Z" />
                        </svg>
                      </span>
                      <TypingDots color={WA.meta} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* WhatsApp input bar — shows user typing + send/mic toggle.
              Its height is fixed at two lines: a bar that grows with the text
              would push the section (and the rest of the page) down while the
              demo types. Longer text scrolls to the caret instead. */}
            <div className="relative z-10 flex items-center gap-2 bg-[#1f2c34] px-2.5 pt-2 pb-6">
              <div
                className="flex flex-1 items-center gap-2 rounded-[22px] px-3 py-1.5"
                style={{ background: WA.inputField }}
              >
                <Smile size={20} style={{ color: WA.meta }} className="shrink-0" />
                <div
                  ref={inputViewRef}
                  className="my-1 flex h-[34px] min-w-0 flex-1 flex-col overflow-hidden"
                  style={{ scrollbarWidth: "none" }}
                >
                  <span
                    className="my-auto block text-[13px] leading-[17px] break-words whitespace-pre-wrap"
                    style={{ color: isUserTyping && inputText ? WA.text : WA.meta }}
                  >
                    {isUserTyping && inputText ? inputText : UI_STRINGS.messageLabel}
                    {isUserTyping && inputText && (
                      <motion.span
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="ml-0.5 inline-block"
                        style={{ color: WA.text }}
                      >
                        |
                      </motion.span>
                    )}
                  </span>
                </div>
                <Paperclip size={18} style={{ color: WA.meta }} className="shrink-0" />
                <Camera size={18} style={{ color: WA.meta }} className="shrink-0" />
              </div>
              {/* Mic → Send arrow toggle: key-change triggers remount + scale-in.
                No AnimatePresence = no layout gap = no shift. */}
              <motion.div
                key={isUserTyping && inputText ? "send" : "mic"}
                initial={reduce ? false : { scale: 0.85, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.18, ease: EASE.out }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: WA.accent }}
              >
                {isUserTyping && inputText ? (
                  <Send size={18} className="text-[#0b0f1a]" />
                ) : (
                  <Mic size={18} className="text-[#0b0f1a]" />
                )}
              </motion.div>
            </div>

            {/* Home indicator */}
            <div className="absolute bottom-2 left-1/2 z-20 h-1 w-28 -translate-x-1/2 rounded-full bg-white/40" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** WhatsApp-Copilot spotlight — an optional convenience channel. Always a DARK spotlight band
 *  (pins data-tone="dark"); reused on the homepage teaser and the /whatsapp
 *  deep-dive page. */
export function WhatsAppSpotlight({ children }: { children?: React.ReactNode }) {
  const c = COPY;
  const reduce = useReducedMotion() ?? false;

  return (
    <Section
      tone="dark"
      className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8"
      aria-label="Assistent auf WhatsApp"
    >
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <motion.div {...reveal(0, reduce)}>
            <p className={`mb-5 ${EYEBROW_CLASS}`}>{c.waEyebrow}</p>
          </motion.div>
          <motion.div {...reveal(1, reduce)}>
            <h2 className={`${H2_CTA_CLASS} mb-4`}>{c.waTitle}</h2>
          </motion.div>
          <motion.div {...reveal(2, reduce)}>
            <p className="mb-10 max-w-xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
              {c.waSub}
            </p>
          </motion.div>
          <ul className="max-w-xl space-y-6">
            {c.waPoints.map((pt, i) => {
              const Icon = pt.icon;
              return (
                <motion.li key={pt.t} {...reveal(i + 3, reduce)} className="flex items-start gap-4">
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accentTile(pt.color, "dark")}`}
                  >
                    <Icon size={17} strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="text-base font-semibold [color:var(--mk-text)]">{pt.t}</p>
                    <p className="mt-1 text-sm leading-relaxed text-pretty [color:var(--mk-text-muted)]">
                      {pt.d}
                    </p>
                  </div>
                </motion.li>
              );
            })}
          </ul>
          {children && (
            <motion.div {...reveal(6, reduce)} className="mt-10">
              {children}
            </motion.div>
          )}
        </div>
        <motion.div {...reveal(2, reduce)} className="relative">
          <PhoneCopilot />
        </motion.div>
      </div>
    </Section>
  );
}

const BENTO_WIDE = new Set([0, 6, 10]);

/** Bento feature grid — every capability. Tone-flexible: inherits the
 *  surrounding section tone (place inside a <Section tone=…>). */
export function FeatureBento() {
  const c = COPY;
  const features = VERTICALS.legal.features;
  const reduce = useReducedMotion() ?? false;
  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
      <motion.div {...reveal(0, reduce)} className="mb-14 text-center">
        <p
          className={`mb-4 justify-center after:h-px after:w-6 after:bg-current after:opacity-50 after:content-[''] ${EYEBROW_CLASS}`}
        >
          {c.bentoEyebrow}
        </p>
        <h2 className={`${H2_CTA_CLASS} mb-4`}>{c.bentoTitle}</h2>
        <p className="mx-auto max-w-2xl text-lg text-pretty [color:var(--mk-text-muted)]">
          {c.bentoSub}
        </p>
      </motion.div>
      <div className="grid grid-flow-dense auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => {
          const Icon = ICONS[f.icon];
          // Three wide tiles: 12 features + 3 extra cells = 15 = five full rows of
          // three. With two wide tiles the grid left a hole in row two.
          const featured = BENTO_WIDE.has(i);
          return (
            <motion.div
              key={f.title}
              {...reveal(i, reduce)}
              whileHover={reduce ? undefined : { y: -2 }}
              className={`group relative overflow-hidden rounded-2xl border p-6 transition-[background-color,border-color,color] duration-[var(--ds-duration-normal)] [background:var(--mk-surface)] motion-reduce:transition-none ${featured ? "brand-border lg:col-span-2" : "[border-color:var(--mk-border)] hover:[border-color:var(--mk-border-strong)]"}`}
            >
              {featured && (
                <div
                  className="absolute -top-12 -right-12 h-40 w-40 rounded-full opacity-30 blur-2xl"
                  style={{
                    background: "radial-gradient(circle, var(--brand-glow), transparent 70%)",
                  }}
                />
              )}
              <div className="relative">
                <div className="brand-soft brand-border mb-4 flex h-11 w-11 items-center justify-center rounded-xl border">
                  {Icon && <Icon size={19} className="brand-text" />}
                </div>
                <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold [color:var(--mk-text)]">
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{f.desc}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default function SubsumioShowcase() {
  const { ui: UI_STRINGS, p } = useMarket();
  return (
    <>
      <WhatsAppSpotlight>
        <Link
          href={p("/whatsapp")}
          className="brand-text group inline-flex items-center gap-1.5 text-sm font-semibold"
        >
          {UI_STRINGS.whatsappDetail}
          <ArrowRight
            size={14}
            className="transition-transform duration-[var(--ds-duration-normal)] group-hover:translate-x-0.5"
          />
        </Link>
      </WhatsAppSpotlight>
      <FeatureBento />
    </>
  );
}
