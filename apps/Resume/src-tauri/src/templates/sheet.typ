// Sheet — the plainest thing an applicant tracking system can read.
// Liberation Sans, tight leading, no rules, no columns, nothing to misparse.

#set page(paper: "us-letter", margin: (x: 50pt, y: 50pt))
#set text(font: "Liberation Sans", size: 10pt, fill: ink)
#set par(justify: false, leading: 0.58em, spacing: 0.72em)

#let section(title) = block(sticky: true, above: 7pt, below: 1pt)[
  #text(size: 10pt, weight: "bold", fill: accent)[#upper(title)]
]

#let role-entry(role) = {
  text(weight: "bold")[#role-heading(role)]
  if when-and-where(role) != "" {
    linebreak()
    text(size: 9pt)[#when-and-where(role)]
  }
  for bullet in bullets-of(role) {
    block(inset: (left: 10pt), above: 2pt, below: 2pt)[- #bullet]
  }
  v(3pt)
}

#text(size: 16pt, weight: "bold")[#doc.contact.name]
#if contact-line() != "" [
  #linebreak()
  #text(size: 9pt)[#contact-line(sep: " | ")]
]

#if doc.headline != "" [ #linebreak() #text(weight: "bold")[#doc.headline] ]

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
    #text(weight: "bold")[#school.institution]
    #if school.credential != "" [ #linebreak() #school.credential ]
    #if when-and-where(school) != "" [
      #linebreak()
      #text(size: 9pt)[#when-and-where(school)]
    ]
    #for note in school.notes [ #linebreak() #note.text ]
    #v(3pt)
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
