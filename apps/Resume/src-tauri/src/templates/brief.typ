// Brief — a labelled professional summary, then education, with each heading
// underlined across the page. Structure follows the University of Washington
// downloadable resume template. Spiral's own wording and typography;
// see docs/template-lineage.md.

#set page(paper: "us-letter", margin: (x: 54pt, y: 50pt))
#set text(font: "Liberation Sans", size: 10pt, fill: ink)
#set par(justify: false, leading: 0.6em, spacing: 0.78em)

#let section(title) = block(above: 12pt, below: 5pt)[
  #text(size: 11pt, weight: "bold", fill: accent)[#upper(title)]
  #v(1pt, weak: true)
  #line(length: 100%, stroke: 0.8pt + ink)
]

#let role-entry(role) = {
  grid(
    columns: (1fr, auto),
    align: (left, right),
    text(weight: "bold")[#{
      let parts = (role.organization, role.location).filter(p => p != "")
      parts.join(", ")
    }],
    text[#date-range(role.start, role.end)],
  )
  if role.title != "" { text(style: "italic")[#role.title] }
  for bullet in bullets-of(role) {
    block(inset: (left: 14pt), above: 2pt, below: 2pt)[• #bullet]
  }
  v(5pt)
}

#align(center)[
  #text(size: 15pt, weight: "bold")[#doc.contact.name]
  #linebreak()
  #text(size: 10pt)[#contact-line(sep: " • ")]
]

#v(6pt)

#if doc.headline != "" [ #text(weight: "bold")[#doc.headline] #v(4pt) ]

#if doc.summary != "" [
  #text(weight: "bold")[Professional Summary: ]#doc.summary
]

#if has(doc.education) [
  #section("Education")
  #for school in doc.education [
    #grid(
      columns: (1fr, auto),
      align: (left, right),
      text(weight: "bold")[#{
        let parts = (school.institution, school.location).filter(p => p != "")
        parts.join(", ")
      }],
      text[#date-range(school.start, school.end)],
    )
    #if school.credential != "" [ #block(inset: (left: 14pt), above: 2pt, below: 2pt)[#school.credential] ]
    #for note in school.notes [ #block(above: 2pt, below: 2pt)[#note.text] ]
    #v(4pt)
  ]
]

#if has(doc.experience) [
  #section("Work Experience")
  #for role in doc.experience [ #role-entry(role) ]
]

#if has(doc.leadership) [
  #section("Leadership Activities")
  #for role in doc.leadership [ #role-entry(role) ]
]

#if has(doc.projects) [
  #section("Projects")
  #for role in doc.projects [ #role-entry(role) ]
]

#if has(doc.skills) or has(doc.awards) or has(doc.interests) [
  #section("Additional")
  #if has(doc.skills) [ #skills-lines().join(linebreak()) #linebreak() ]
  #if has(doc.awards) [ #text(weight: "bold")[Honors: ]#doc.awards.join(", ") #linebreak() ]
  #if has(doc.interests) [ #text(weight: "bold")[Interests: ]#doc.interests.join(", ") ]
]
