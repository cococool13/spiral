"use client";

import { LazyMotion, domAnimation } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Loads only framer-motion's DOM animation feature set (~half the full
 * bundle). All components use `m.*` instead of `motion.*`; strict mode
 * throws if anyone regresses to the full-bundle import.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
