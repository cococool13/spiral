// The contract between the document model and every template.
//
// The resume arrives as JSON on sys.inputs.resume — never interpolated into
// this file's text — so nothing a user types can become Typst syntax.
//
// Everything below is presentation-neutral. A template decides how a role
// looks; this file only decides what a role *is*.

#let doc = json(bytes(sys.inputs.resume))

// The palette, all of it from `accent.rs` — the accent the user chose,
// validated against a closed set in Rust before it ever reaches this file, and
// the three fixed colours the Word half also reads. A template must not write
// a colour of its own: a raw hex here silently disagrees with the .docx, and
// `no_template_writes_its_own_colour` fails the build if one appears.
#let accent = rgb("#" + sys.inputs.accent)
#let ink = rgb("#" + sys.inputs.ink)
#let quiet = rgb("#" + sys.inputs.quiet)
#let shading = rgb("#" + sys.inputs.shading)

// Resumes are read, not justified prose. Hyphenating a name or an employer
// mid-word is what made a restyle look unreadable. Templates may still set
// face and size; they must not turn hyphenation back on.
#set text(hyphenate: false)

// "Jan 2021 — Present", or whichever half exists. Dates are shown exactly as
// the user wrote them: `raw` is the field the Check screen edits, and no
// template is allowed to reformat a date it did not parse.
#let date-range(start, end) = {
  let a = start.raw
  let b = if end.present and end.raw == "" { "Present" } else { end.raw }
  if a == "" and b == "" { return "" }
  if a == "" { return b }
  if b == "" { return a }
  a + " — " + b
}

// The contact strip under the name. Empty fields disappear rather than leaving
// an orphaned separator.
#let contact-line(sep: " · ") = {
  let parts = (doc.contact.email, doc.contact.phone, doc.contact.location)
  parts = parts + doc.contact.links
  parts.filter(p => p != "").join(sep)
}

// When the work happened, and where it happened when the person said so. The
// templates that set the dates apart from the heading use this, so that a
// location can never be the one field a template quietly leaves out.
#let when-and-where(entry) = {
  let parts = (date-range(entry.start, entry.end), entry.location).filter(p => p != "")
  parts.join(" · ")
}

// Title on the left, dates on the right. Location is a different field and
// must not sit in the date column — that is what used to crush a long heading
// into a single word.
#let heading-row(primary, aside) = grid(
  columns: (1fr, auto),
  column-gutter: 12pt,
  align: (left + horizon, right + horizon),
  primary,
  aside,
)

// A role's heading, in the order a reader scans: what you did, then where.
#let role-heading(role) = {
  let bits = (role.title, role.organization).filter(b => b != "")
  bits.join(", ")
}

#let bullets-of(role) = role.bullets.map(b => b.text).filter(t => t != "")

// Skills as lines ready to set: "Technical: Rust, Python", or one plain list
// when the person never used categories.
#let skills-lines() = doc.skills.map(group => {
  if group.label == "" { group.items.join(" · ") } else { group.label + ": " + group.items.join(", ") }
}).filter(line => line != "")

// True when the section has anything worth a heading. Templates call this so an
// empty resume renders as a clean page rather than a list of bare headings.
#let has(items) = items.len() > 0
