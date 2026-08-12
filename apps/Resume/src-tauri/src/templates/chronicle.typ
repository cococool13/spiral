// Chronicle — education first, activities and awards given their own sections.
// Structure follows MIT's Template A, aimed at students and recent graduates.
// Spiral's own wording and typography; see docs/template-lineage.md.

#set page(paper: "us-letter", margin: (x: 58pt, y: 56pt))
#set text(font: "Liberation Serif", size: 10.5pt, fill: rgb("#111111"))
#set par(justify: false, leading: 0.6em, spacing: 0.8em)

#let section(title) = block(above: 13pt, below: 4pt)[
  #text(size: 13pt, weight: "bold", fill: accent)[#title]
  #v(1pt, weak: true)
  #line(length: 100%, stroke: 0.5pt + rgb("#111111"))
]

#let role-entry(role) = {
  grid(
    columns: (1fr, auto),
    align: (left, right),
    [#text(weight: "bold")[#role.organization]#if role.location != "" [, #role.location]],
    text[#date-range(role.start, role.end)],
  )
  if role.title != "" { role.title }
  for bullet in bullets-of(role) {
    block(inset: (left: 18pt), above: 2pt, below: 2pt)[• #bullet]
  }
  v(6pt)
}

#align(center)[
  #text(size: 14pt, weight: "bold")[#doc.contact.name]
  #linebreak()
  #text(size: 10pt)[#contact-line(sep: " | ")]
]

#if doc.headline != "" [ #align(center)[#text(weight: "bold")[#doc.headline]] ]

#if doc.summary != "" [
  #section("Summary")
  #doc.summary
]

#if has(doc.education) [
  #section("Education")
  #for school in doc.education [
    #grid(
      columns: (1fr, auto),
      align: (left, right),
      [#text(weight: "bold")[#school.institution]#if school.location != "" [, #school.location]],
      text[#date-range(school.start, school.end)],
    )
    #if school.credential != "" [ #school.credential ]
    #for note in school.notes [ #linebreak() #note.text ]
    #v(6pt)
  ]
]

#if has(doc.experience) [
  #section("Experience")
  #for role in doc.experience [ #role-entry(role) ]
]

#if has(doc.projects) [
  #section("Projects")
  #for role in doc.projects [ #role-entry(role) ]
]

#if has(doc.leadership) [
  #section("Activities & Extracurriculars")
  #for role in doc.leadership [ #role-entry(role) ]
]

#if has(doc.awards) [
  #section("Awards & Accomplishments")
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
