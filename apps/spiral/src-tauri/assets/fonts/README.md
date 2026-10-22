# Resume faces — not brand faces

These are **not** Spiral brand fonts and must never be used in the app chrome.
The app chrome uses Host Grotesk, synced from `/brand`. These eight
files are the opposite: they are what the *user's document* is set in, and the
whole point of decision 6 in the design spec is that a resume must not look like
a Spiral product.

| Family | Metrically identical to | Used for |
| --- | --- | --- |
| Liberation Serif 2.1.5 | Times New Roman | serif templates |
| Liberation Sans 2.1.5 | Arial | sans templates |

**Why metric compatibility matters here.** The PDF embeds Liberation. A DOCX
cannot embed anything, so it names Times New Roman and Arial instead. Because
the metrics are identical, both files break lines in the same places and run to
the same number of pages — which is what lets the style picker's preview honestly
claim to show what you will get, in either format.

Licence: SIL Open Font License 1.1. Liberation is a trademark of Red Hat, Inc.
Source: the upstream 2.1.5 release, as shipped inside LibreOffice.
Full licence text: <https://github.com/liberationfonts/liberation-fonts/blob/main/LICENSE>

Committed, not synced — `scripts/sync-brand.mjs` has no business copying these,
because they do not come from `/brand`.
