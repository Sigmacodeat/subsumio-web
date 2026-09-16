"use client";

import { useEffect } from "react";

export default function LangSetter() {
  useEffect(() => {
    document.documentElement.lang = "de-AT";
  }, []);
  return null;
}
