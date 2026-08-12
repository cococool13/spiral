// Index — skills brought forward, directly under education, for technical and
// lab-heavy applications. Structure follows MIT's Template B. Spiral's own
// wording and typography; see docs/template-lineage.md.

#set page(paper: "us-letter", margin: (x: 58pt, y: 56pt))
#set text(font: "Liberation Serif", size: 10.5pt, fill: ink)
#set par(justify: false, leading: 0.6em, spacing: 0.78em)

#let section(title) = block(above: 12pt, below: 4pt)[
  #align(center)[#text(size: 11pt, weight: "bold", tracking: 0.04em, fill: accent)[#upper(title)]]
  #v(1pt, weak: true)
  #line(length: 100%, stroke: 0.7pt + ink)
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

#grid(
  columns: (auto, 1fr),
  column-gutter: 10pt,
  align: (left + bottom, left + bottom),
  text(size: 14pt, weight: "bold")[#doc.contact.name],
  text(size: 9.5pt)[#contact-line(sep: " | ")],
)

#if doc.headline != "" [ #text(weight: "bold")[#doc.headline] ]

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

#if has(doc.skills) [
  #section("Skills & Proficiencies")
  #skills-lines().join(linebreak())
]

#if has(doc.experience) [
  #section("Professional Experience")
  #for role in doc.experience [ #role-entry(role) ]
]

#if has(doc.projects) [
  #section("Projects")
  #for role in doc.projects [ #role-entry(role) ]
]

#if has(doc.leadership) [
  #section("Leadership Experience")
  #for role in doc.leadership [ #role-entry(role) ]
]

#if has(doc.awards) [
  #section("Awards")
  #doc.awards.join(linebreak())
]

#if has(doc.interests) [
  #section("Interests")
  #doc.interests.join(", ")
]
