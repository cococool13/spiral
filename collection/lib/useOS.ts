"use client";

import { useEffect, useState } from "react";

export type OS = "mac" | "windows" | "other";

interface UADataNavigator extends Navigator {
  userAgentData?: { platform: string };
}

export function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const nav = navigator as UADataNavigator;
  const platform = (
    nav.userAgentData?.platform ??
    nav.platform ??
    nav.userAgent
  ).toLowerCase();
  if (platform.includes("mac")) return "mac";
  if (platform.includes("win")) return "windows";
  return "other";
}

/** SSR-safe OS detection; returns "other" until mounted. */
export function useOS(): OS {
  const [os, setOS] = useState<OS>("other");
  useEffect(() => {
    setOS(detectOS());
  }, []);
  return os;
}
