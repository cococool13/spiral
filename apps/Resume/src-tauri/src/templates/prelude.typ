// The contract between the document model and every template.
//
// The resume arrives as JSON on sys.inputs.resume — never interpolated into
// this file's text — so nothing a user types can become Typst syntax.
//
// Everything below is presentation-neutral. A template decides how a role
// looks; this file only decides what a role *is*.

#let doc = json(bytes(sys.inputs.resume))

// The one colour the user chose, validated against a closed set in Rust before
// it ever reaches this file. A template must not invent its own colour.
#let accent = rgb("#" + sys.inputs.accent)
#let quiet = rgb("#555555")

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

// A role's heading, in the order a reader scans: what you did, then where.
#let role-heading(role) = {
  let bits = (role.title, role.organization).filter(b => b != "")
  bits.join(", ")
}

#let bullets-of(role) = role.bullets.map(b => b.text).filter(t => t != "")

// True when the section has anything worth a heading. Templates call this so an
// empty resume renders as a clean page rather than a list of bare headings.
#let has(items) = items.len() > 0
