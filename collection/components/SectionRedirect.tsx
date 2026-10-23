"use client";

import { useEffect } from "react";

export default function SectionRedirect({
  href,
  title,
  sentence,
}: {
  href: string;
  title: string;
  sentence: string;
}) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return (
    <main id="content" className="information-page shell">
      <h1 className="type-display text-4xl text-paper">{title}</h1>
      <p className="mt-8 text-lg text-gray">
        <a href={href}>{sentence}</a>
      </p>
    </main>
  );
}
