// Sheet — the plainest thing an applicant tracking system can read.
// Liberation Sans, tight leading, no rules, no columns, nothing to misparse.

#set page(paper: "us-letter", margin: (x: 50pt, y: 50pt))
#set text(font: "Liberation Sans", size: 10pt, fill: rgb("#111111"))
#set par(justify: false, leading: 0.58em, spacing: 0.72em)

#let section(title) = {
  v(7pt)
  text(size: 10pt, weight: "bold")[#upper(title)]
  v(1pt)
}

#text(size: 16pt, weight: "bold")[#doc.contact.name]
#if contact-line() != "" [
  #linebreak()
  #text(size: 9pt)[#contact-line(sep: " | ")]
]

#if doc.summary != "" [
  #section("Summary")
  #doc.summary
]

#if has(doc.experience) [
  #section("Experience")
  #for role in doc.experience [
    #text(weight: "bold")[#role-heading(role)]
    #if date-range(role.start, role.end) != "" [
      #linebreak()
      #text(size: 9pt)[#date-range(role.start, role.end)]
    ]
    #for bullet in bullets-of(role) [
      #block(inset: (left: 10pt), above: 2pt, below: 2pt)[- #bullet]
    ]
    #v(3pt)
  ]
]

#if has(doc.projects) [
  #section("Projects")
  #for role in doc.projects [
    #text(weight: "bold")[#role-heading(role)]
    #for bullet in bullets-of(role) [
      #block(inset: (left: 10pt), above: 2pt, below: 2pt)[- #bullet]
    ]
    #v(3pt)
  ]
]

#if has(doc.education) [
  #section("Education")
  #for school in doc.education [
    #text(weight: "bold")[#school.institution]
    #if school.credential != "" [
      #linebreak()
      #school.credential
    ]
    #if date-range(school.start, school.end) != "" [
      #linebreak()
      #text(size: 9pt)[#date-range(school.start, school.end)]
    ]
    #v(3pt)
  ]
]

#if has(doc.skills) [
  #section("Skills")
  #doc.skills.join(", ")
]
