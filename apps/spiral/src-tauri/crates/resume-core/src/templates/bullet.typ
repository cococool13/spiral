// Bullet — centred headings, a rule under the name, education first.
// Structure follows the Harvard College bullet-point layout, which career
// offices recommend as the safest general-purpose shape. Spiral's own wording
// and typography; see docs/template-lineage.md.

#set page(paper: "us-letter", margin: (x: 60pt, y: 54pt))
#set text(font: "Liberation Serif", size: 10.5pt, fill: ink)
#set par(justify: false, leading: 0.6em, spacing: 0.8em)

#let section(title) = block(sticky: true, above: 9pt, below: 3pt)[
  #align(center)[#text(size: 10.5pt, weight: "bold", fill: accent)[#title]]
]

// Organisation flush left with the place; the role and dates on the line below.
#let entry(primary, secondary, right-top, right-bottom, notes) = {
  grid(
    columns: (1fr, auto),
    align: (left, right),
    text(weight: "bold")[#primary],
    text[#right-top],
  )
  if secondary != "" or right-bottom != "" {
    grid(
      columns: (1fr, auto),
      align: (left, right),
      text(weight: "bold")[#secondary],
      text[#right-bottom],
    )
  }
  for note in notes {
    block(inset: (left: 16pt), above: 3pt, below: 3pt)[• #note]
  }
  v(5pt)
}

#let role-entry(role) = entry(
  role.organization, role.title, role.location, date-range(role.start, role.end), bullets-of(role),
)

#align(center)[#text(size: 12pt, weight: "bold")[#doc.contact.name]]
#v(2pt)
#line(length: 100%, stroke: 0.6pt + ink)
#v(2pt)
#align(center)[#text(size: 10pt)[#contact-line(sep: " • ")]]

#if doc.headline != "" [ #align(center)[#text(weight: "bold")[#doc.headline]] ]

#if doc.summary != "" [
  #section("Summary")
  #doc.summary
]

#if has(doc.education) [
  #section("Education")
  #for school in doc.education [
    #entry(
      school.institution, school.credential, school.location,
      date-range(school.start, school.end), school.notes.map(n => n.text),
    )
  ]
]

#if has(doc.experience) [
  #section("Experience")
  #for role in doc.experience [ #role-entry(role) ]
]

#if has(doc.leadership) [
  #section("Leadership & Activities")
  #for role in doc.leadership [ #role-entry(role) ]
]

#if has(doc.projects) [
  #section("Projects")
  #for role in doc.projects [ #role-entry(role) ]
]

#if has(doc.awards) [
  #section("Awards")
  #doc.awards.join(linebreak())
]

#if has(doc.skills) or has(doc.interests) [
  #section("Skills & Interests")
  #skills-lines().join(linebreak())
  #if has(doc.interests) [
    #if has(doc.skills) [#linebreak()]
    #text(weight: "bold")[Interests: ]#doc.interests.join(", ")
  ]
]
