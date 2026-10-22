// Timeline — the employment history is the document. A headline, a short skills
// list, then role after role in reverse order. Structure follows Jobscan's
// chronological template. Spiral's own wording and typography;
// see docs/template-lineage.md.

#set page(paper: "us-letter", margin: (x: 58pt, y: 54pt))
#set text(font: "Liberation Serif", size: 10.5pt, fill: ink)
#set par(justify: false, leading: 0.62em, spacing: 0.85em)

#let section(title) = block(sticky: true, above: 10pt, below: 3pt)[
  #align(center)[#text(size: 12pt, weight: "bold", style: "italic", fill: accent)[#title]]
]

#let role-entry(role) = {
  text(weight: "bold")[#{
    let parts = (role.organization, role.location).filter(p => p != "")
    parts.join(", ")
  }]
  grid(
    columns: (1fr, auto),
    align: (left, right),
    text(style: "italic")[#role.title],
    text[#date-range(role.start, role.end)],
  )
  for bullet in bullets-of(role) {
    block(above: 4pt, below: 4pt)[#bullet]
  }
  v(6pt)
}

#grid(
  columns: (1fr, auto),
  align: (left + horizon, right + horizon),
  text(size: 17pt, weight: "bold")[#doc.contact.name],
  text(size: 9.5pt)[#contact-line(sep: " • ")],
)

#if doc.headline != "" [
  #v(3pt)
  #text(weight: "bold")[#doc.headline]
  #v(2pt)
  #line(length: 100%, stroke: 1.5pt + quiet)
]

#if doc.summary != "" [
  #section("Summary")
  #doc.summary
]

#if has(doc.skills) [
  #section("Top Skills")
  #for line in skills-lines() [ #block(inset: (left: 14pt), above: 3pt, below: 3pt)[• #line] ]
]

#if has(doc.experience) [
  #section("Work Experience")
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
      [#text(weight: "bold")[#school.institution]#if school.credential != "" [ — #school.credential]#if school.location != "" [, #school.location]],
      text[#date-range(school.start, school.end)],
    )
    #for note in school.notes [ #linebreak() #note.text ]
    #v(4pt)
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

#if has(doc.interests) [
  #section("Interests")
  #doc.interests.join(" · ")
]
