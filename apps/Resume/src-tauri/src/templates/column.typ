// Column — the conventional single-column resume, set properly.
// Liberation Serif throughout. Nothing decorative; the hierarchy does the work.

#set page(paper: "us-letter", margin: (x: 54pt, y: 54pt))
#set text(font: "Liberation Serif", size: 10.5pt, fill: ink)
#set par(justify: false, leading: 0.62em, spacing: 0.9em)

#let section(title) = block(sticky: true, above: 6pt, below: 2pt)[
  #text(size: 10pt, weight: "bold", tracking: 0.08em, fill: accent, upper(title))
]

#let role-entry(role) = {
  grid(
    columns: (1fr, auto),
    align: (left, right),
    text(weight: "bold")[#role-heading(role)],
    text(size: 9.5pt, fill: quiet)[#when-and-where(role)],
  )
  for bullet in bullets-of(role) {
    block(inset: (left: 12pt), above: 3pt, below: 3pt)[• #bullet]
  }
  v(4pt)
}

#align(center)[
  #text(size: 19pt, weight: "bold")[#doc.contact.name]
  #if contact-line() != "" [
    #linebreak()
    #text(size: 9.5pt, fill: quiet)[#contact-line()]
  ]
]

#v(4pt)

#if doc.headline != "" [ #align(center)[#text(weight: "bold")[#doc.headline]] ]

#if doc.summary != "" [
  #section("Summary")
  #doc.summary
]

#if has(doc.experience) [
  #section("Experience")
  #for role in doc.experience [ #role-entry(role) ]
]

#if has(doc.projects) [
  #section("Projects")
  #for role in doc.projects [ #role-entry(role) ]
]

#if has(doc.education) [
  #section("Education")
  #for school in doc.education [
    #grid(
      columns: (1fr, auto),
      align: (left, right),
      [#text(weight: "bold")[#school.institution]#if school.credential != "" [ — #school.credential]],
      text(size: 9.5pt, fill: quiet)[#when-and-where(school)],
    )
    #for note in school.notes [ #block(inset: (left: 12pt), above: 3pt, below: 3pt)[#note.text] ]
  ]
]

#if has(doc.leadership) [
  #section("Leadership & Activities")
  #for role in doc.leadership [ #role-entry(role) ]
]

#if has(doc.awards) [
  #section("Awards")
  #doc.awards.join(linebreak())
]

#if has(doc.skills) [
  #section("Skills")
  #skills-lines().join(linebreak())
]

#if has(doc.interests) [
  #section("Interests")
  #doc.interests.join(" · ")
]
