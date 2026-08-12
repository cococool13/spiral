// Column — the conventional single-column resume, set properly.
// Liberation Serif throughout. Nothing decorative; the hierarchy does the work.

#set page(paper: "us-letter", margin: (x: 54pt, y: 54pt))
#set text(font: "Liberation Serif", size: 10.5pt, fill: rgb("#111111"))
#set par(justify: false, leading: 0.62em, spacing: 0.9em)

#let section(title) = {
  v(6pt)
  text(size: 10pt, weight: "bold", tracking: 0.08em, fill: accent, upper(title))
  v(2pt)
}

#align(center)[
  #text(size: 19pt, weight: "bold")[#doc.contact.name]
  #if contact-line() != "" [
    #linebreak()
    #text(size: 9.5pt, fill: quiet)[#contact-line()]
  ]
]

#v(4pt)

#if doc.summary != "" [
  #section("Summary")
  #doc.summary
]

#if has(doc.experience) [
  #section("Experience")
  #for role in doc.experience [
    #grid(
      columns: (1fr, auto),
      align: (left, right),
      text(weight: "bold")[#role-heading(role)],
      text(size: 9.5pt, fill: quiet)[#date-range(role.start, role.end)],
    )
    #for bullet in bullets-of(role) [
      #block(inset: (left: 12pt), above: 3pt, below: 3pt)[• #bullet]
    ]
    #v(4pt)
  ]
]

#if has(doc.projects) [
  #section("Projects")
  #for role in doc.projects [
    #text(weight: "bold")[#role-heading(role)]
    #for bullet in bullets-of(role) [
      #block(inset: (left: 12pt), above: 3pt, below: 3pt)[• #bullet]
    ]
    #v(4pt)
  ]
]

#if has(doc.education) [
  #section("Education")
  #for school in doc.education [
    #grid(
      columns: (1fr, auto),
      align: (left, right),
      [#text(weight: "bold")[#school.institution]#if school.credential != "" [ — #school.credential]],
      text(size: 9.5pt, fill: quiet)[#date-range(school.start, school.end)],
    )
  ]
]

#if has(doc.skills) [
  #section("Skills")
  #doc.skills.join(" · ")
]
