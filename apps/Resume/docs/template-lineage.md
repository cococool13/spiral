# Where the templates come from

Date: 2026-08-12

Twelve templates ship. Five are Spiral's own. Seven follow the *structure* of
published resume templates that Cohen researched and collected in
`apps/Resume/Resume Template/` — see the comparison written there.

## What was taken, and what was not

**Taken:** the structural decisions — which sections exist, what order they run
in, whether the name is centred, whether headings carry a rule, whether dates sit
flush right or in a rail. Layout structure is the useful part and the part a
student is actually choosing between.

**Not taken:** the prompt text ("Begin each line with an action verb…"), the
sample content, the fonts, the measurements, or any file. Every template in this
app is written from scratch in Typst, sets Liberation Serif or Liberation Sans,
and renders the user's own data. No third-party document is bundled, opened, or
distributed.

**Not used:** the source institution's name. A style called "Harvard" would read
as endorsement, and none of these organisations has endorsed or reviewed
anything here. The names are Spiral's own.

## The map

| Spiral style | Structure follows | Shape |
| --- | --- | --- |
| **Bullet** | Harvard College bullet-point template | Centred headings, rule under the name, education first. The conservative default. |
| **Brief** | University of Washington downloadable template | A labelled professional summary, then education; each heading underlined full-width. |
| **Chronicle** | MIT Template A | Education first, with activities and awards given their own sections. For students. |
| **Index** | MIT Template B | Skills lifted directly under education, for technical and lab-heavy applications. |
| **Timeline** | Jobscan chronological | The employment history is the document: headline, top skills, then role after role. |
| **Blend** | Jobscan hybrid | Skills and accomplishments above the work history, for a career changer. |
| **Lead** | Jobscan executive | Name and headline between rules; experience written as outcomes. |

Spiral's own five — **Column**, **Ledger**, **Sheet**, **Rule**, **Card** — owe
nothing to the above.

## What this cost the document model

Seven of these need sections the model did not have, so `ResumeDoc` grew:
`headline`, `leadership`, `awards`, `interests`, and skills became
`Vec<SkillGroup>` so that `Technical: Rust, Python` is one representation rather
than a special case.

`headline` is deliberately **never parsed**. A line like "President and CEO:
Manufacturing Turnarounds" is a claim about a person, and this app does not
invent claims — the field exists on the Check screen and stays empty unless
someone writes one.

## The rule that still holds

Every template, old and new, renders **every** section the model has. A user with
awards who picks Column must not lose them. That is not a style decision; silently
dropping someone's content is the bug this whole app is built to avoid.
