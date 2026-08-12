// Lead — the name and a headline carried between two rules, then experience
// written as outcomes rather than duties. Structure follows Jobscan's executive
// template, for applicants with a long record. Spiral's own wording and
// typography; see docs/template-lineage.md.

#set page(paper: "us-letter", margin: (x: 58pt, y: 52pt))
#set text(font: "Liberation Serif", size: 10pt, fill: rgb("#111111"))
#set par(justify: false, leading: 0.65em, spacing: 0.85em)

#let section(title) = {
  v(12pt)
  line(length: 100%, stroke: 0.7pt + rgb("#111111"))
  v(3pt)
  align(center)[#text(size: 10.5pt, weight: "bold", tracking: 0.06em, fill: accent)[#upper(title)]]
  v(2pt)
  line(length: 100%, stroke: 0.7pt + rgb("#111111"))
  v(6pt)
}

#let role-entry(role) = {
  grid(
    columns: (1fr, auto),
    align: (left, right),
    [#text(weight: "bold")[#role.organization]#{
      let rest = (role.location, role.title).filter(p => p != "")
      if rest.len() > 0 [, #rest.join(" • ")]
    }],
    text[#date-range(role.start, role.end)],
  )
  for bullet in bullets-of(role) {
    block(inset: (left: 16pt), above: 4pt, below: 4pt)[▸ #bullet]
  }
  v(7pt)
}

#align(center)[#text(size: 18pt, weight: "bold", tracking: 0.2em)[#upper(doc.contact.name)]]
#if doc.headline != "" [
  #v(3pt)
  #align(center)[#text(weight: "bold")[#doc.headline]]
]
#v(5pt)
#line(length: 100%, stroke: 0.7pt + rgb("#111111"))
#v(3pt)
#align(center)[#text(size: 9.5pt)[#contact-line(sep: " • ")]]
#v(3pt)
#line(length: 100%, stroke: 0.7pt + rgb("#111111"))

#if doc.summary != "" [ #v(8pt) #doc.summary ]

#if has(doc.skills) [
  #section("Core Competencies")
  #skills-lines().join(linebreak())
]

#if has(doc.experience) [
  #section("Professional Experience")
  #for role in doc.experience [ #role-entry(role) ]
]

#if has(doc.projects) [
  #section("Selected Projects")
  #for role in doc.projects [ #role-entry(role) ]
]

#if has(doc.leadership) [
  #section("Board & Leadership")
  #for role in doc.leadership [ #role-entry(role) ]
]

#if has(doc.education) [
  #section("Education")
  #for school in doc.education [
    #grid(
      columns: (1fr, auto),
      align: (left, right),
      [#text(weight: "bold")[#school.institution]#if school.credential != "" [ — #school.credential]],
      text[#date-range(school.start, school.end)],
    )
    #for note in school.notes [ #linebreak() #note.text ]
    #v(4pt)
  ]
]

#if has(doc.awards) [
  #section("Awards")
  #doc.awards.join(linebreak())
]

#if has(doc.interests) [
  #section("Interests")
  #doc.interests.join(" · ")
]
