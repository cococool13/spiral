// Card — a name block at the top, body below. Sans throughout.
// The block is a flat fill, not a gradient and not an image: Word can draw a
// shaded paragraph, which is what keeps this inside the template envelope.

#set page(paper: "us-letter", margin: (x: 0pt, y: 0pt))
#set text(font: "Liberation Sans", size: 10pt, fill: ink)
#set par(justify: false, leading: 0.6em, spacing: 0.8em)

#let body-margin = 52pt

#let section(title) = block(sticky: true, above: 8pt, below: 2pt)[
  #text(size: 9.5pt, weight: "bold", tracking: 0.08em, fill: accent)[#upper(title)]
]

#let role-entry(role) = {
  heading-row(
    text(weight: "bold")[#role-heading(role)],
    text(size: 9pt, fill: quiet)[#date-range(role.start, role.end)],
  )
  if role.location != "" {
    text(size: 9pt, fill: quiet)[#role.location]
  }
  for bullet in bullets-of(role) {
    block(inset: (left: 12pt), above: 3pt, below: 3pt)[• #bullet]
  }
  v(4pt)
}

#block(
  width: 100%,
  fill: shading,
  inset: (x: body-margin, y: 26pt),
)[
  #text(size: 20pt, weight: "bold")[#doc.contact.name]
  #if contact-line() != "" [
    #linebreak()
    #text(size: 9.5pt, fill: quiet)[#contact-line()]
  ]
  #if doc.headline != "" [ #linebreak() #text(weight: "bold")[#doc.headline] ]
]

#block(inset: (x: body-margin, y: 26pt))[
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
      #heading-row(
        [#text(weight: "bold")[#school.institution]#if school.credential != "" [ — #school.credential]],
        text(size: 9pt, fill: quiet)[#date-range(school.start, school.end)],
      )
      #if school.location != "" [ #text(size: 9pt, fill: quiet)[#school.location] ]
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
]
