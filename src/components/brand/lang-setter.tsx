"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function LangSetter() {
  const pathname = usePathname();
  useEffect(() => {
    const lang = pathname.startsWith("/en")
      ? "en"
      : pathname.startsWith("/at")
        ? "de-AT"
        : pathname.startsWith("/ch")
          ? "de-CH"
          : "de";
    document.documentElement.lang = lang;
  }, [pathname]);
  return null;
}
