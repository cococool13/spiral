"use client";

import GlassPillCTA from "@/components/GlassPillCTA";
import type { AppPage } from "@/lib/appPages";
import { apps } from "@/lib/apps";
import { offerFor } from "@/lib/downloadOffer";
import { useOS } from "@/lib/useOS";

/** Keep the hero and closing offers identical, including source-only platforms. */
export default function AppActions({ page }: { page: AppPage }) {
  const app = apps.find((item) => item.slug === page.slug);
  const { os, ready } = useOS();
  const primaryUrl = app?.downloads
    ? ready
      ? offerFor(app, os)?.url
      : app.downloads.all
    : page.cta?.href;
  return (
    <div className="app-actions">
      {app?.downloads ? (
        <GlassPillCTA app={app} />
      ) : page.cta ? (
        <a href={page.cta.href} className="glass-pill">
          {page.cta.label}
        </a>
      ) : null}
      {primaryUrl !== page.secondary.href ? (
        <a href={page.secondary.href} className="glass-pill glass-pill--secondary">
          {page.secondary.label}
        </a>
      ) : null}
    </div>
  );
}
