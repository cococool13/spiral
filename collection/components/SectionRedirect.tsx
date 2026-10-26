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
    <main id="content" className="page">
      <div className="page-in">
        <h1>{title}</h1>
        <p className="lede">
          <a href={href}>{sentence}</a>
        </p>
      </div>
    </main>
  );
}
