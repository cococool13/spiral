// Card — a name block at the top, body below. Sans throughout.
// The block is a flat fill, not a gradient and not an image: Word can draw a
// shaded paragraph, which is what keeps this inside the template envelope.

#set page(paper: "us-letter", margin: (x: 0pt, y: 0pt))
#set text(font: "Liberation Sans", size: 10pt, fill: rgb("#111111"))
#set par(justify: false, leading: 0.6em, spacing: 0.8em)

#let body-margin = 52pt

#let section(title) = {
  v(8pt)
  text(size: 9.5pt, weight: "bold", tracking: 0.08em, fill: accent)[#upper(title)]
  v(2pt)
}

#block(
  width: 100%,
  fill: rgb("#f0efec"),
  inset: (x: body-margin, y: 26pt),
)[
  #text(size: 20pt, weight: "bold")[#doc.contact.name]
  #if contact-line() != "" [
    #linebreak()
    #text(size: 9.5pt, fill: quiet)[#contact-line()]
  ]
]

#block(inset: (x: body-margin, y: 26pt))[
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
        text(size: 9pt, fill: quiet)[#date-range(role.start, role.end)],
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
        text(size: 9pt, fill: quiet)[#date-range(school.start, school.end)],
      )
    ]
  ]

  #if has(doc.skills) [
    #section("Skills")
    #doc.skills.join(" · ")
  ]
]
