/** A message that appears after something happened.
 *
 *  Every one of these is the app's answer to an action the user just took —
 *  saved, failed, refused. Rendered as a plain paragraph it is silent to a
 *  screen reader, so someone pressing "Save the key" gets no reply at all.
 *
 *  Warnings announce as alerts because they interrupt a task; everything else
 *  is polite. Both are mounted with the message rather than updated in place,
 *  which Chromium and WebKit announce reliably — and those are the only two
 *  engines this app ever runs in. */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn";
  children: React.ReactNode;
}) {
  return (
    <p
      className={tone === "warn" ? "notice notice--warn" : "notice"}
      role={tone === "warn" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
