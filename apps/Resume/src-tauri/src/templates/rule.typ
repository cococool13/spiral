// Rule — serif, with a hairline under each section heading.
// The rules are the only ornament; they exist to separate, not to decorate.

#set page(paper: "us-letter", margin: (x: 56pt, y: 54pt))
#set text(font: "Liberation Serif", size: 10.5pt, fill: rgb("#111111"))
#set par(justify: false, leading: 0.62em, spacing: 0.9em)

// The rule belongs to the heading, not to the body — so it sits tight under the
// words and the air goes below it. `block` with explicit spacing is what stops
// paragraph spacing from opening a gap Typst would otherwise insert on my behalf.
#let section(title) = block(above: 11pt, below: 6pt)[
  #text(size: 9.5pt, weight: "bold", tracking: 0.1em)[#upper(title)]
  #v(2pt, weak: true)
  #line(length: 100%, stroke: 0.5pt + quiet)
]

#text(size: 20pt, weight: "bold")[#doc.contact.name]
#if contact-line() != "" [
  #linebreak()
  #text(size: 9.5pt, fill: quiet)[#contact-line()]
]

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
      text(size: 9.5pt, style: "italic", fill: quiet)[#date-range(role.start, role.end)],
    )
    #for bullet in bullets-of(role) [
      #block(inset: (left: 14pt), above: 3pt, below: 3pt)[• #bullet]
    ]
    #v(5pt)
  ]
]

#if has(doc.projects) [
  #section("Projects")
  #for role in doc.projects [
    #text(weight: "bold")[#role-heading(role)]
    #for bullet in bullets-of(role) [
      #block(inset: (left: 14pt), above: 3pt, below: 3pt)[• #bullet]
    ]
    #v(5pt)
  ]
]

#if has(doc.education) [
  #section("Education")
  #for school in doc.education [
    #grid(
      columns: (1fr, auto),
      align: (left, right),
      [#text(weight: "bold")[#school.institution]#if school.credential != "" [ — #school.credential]],
      text(size: 9.5pt, style: "italic", fill: quiet)[#date-range(school.start, school.end)],
    )
  ]
]

#if has(doc.skills) [
  #section("Skills")
  #doc.skills.join(" · ")
]
