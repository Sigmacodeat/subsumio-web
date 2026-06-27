"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function LangSetter() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.lang = pathname.startsWith("/en") ? "en" : "de";
  }, [pathname]);
  return null;
}
