"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { marketFromPath } from "@/lib/market";

export default function LangSetter() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.lang = marketFromPath(pathname) === "de" ? "de-DE" : "de-AT";
  }, [pathname]);
  return null;
}
