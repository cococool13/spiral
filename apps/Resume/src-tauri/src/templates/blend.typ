// Blend — skills and accomplishments above the work history, for someone whose
// capability is not obvious from their job titles. Structure follows Jobscan's
// hybrid template. Spiral's own wording and typography;
// see docs/template-lineage.md.

#set page(paper: "us-letter", margin: (x: 56pt, y: 52pt))
#set text(font: "Liberation Sans", size: 9.5pt, fill: ink)
#set par(justify: false, leading: 0.65em, spacing: 0.85em)

#let section(title) = {
  v(11pt)
  text(size: 9.5pt, weight: "bold", tracking: 0.22em, fill: accent)[#upper(title)]
  v(4pt)
}

#let role-entry(role) = {
  grid(
    columns: (1fr, auto),
    align: (left, right),
    text(size: 10pt)[#{
      let parts = (upper(role.title), role.organization, role.location).filter(p => p != "")
      parts.join(" | ")
    }],
    text[#date-range(role.start, role.end)],
  )
  for bullet in bullets-of(role) {
    block(inset: (left: 16pt), above: 4pt, below: 4pt)[#bullet]
  }
  v(6pt)
}

#text(size: 20pt, weight: "bold", tracking: 0.18em)[#upper(doc.contact.name)]
#v(3pt)
#line(length: 100%, stroke: 0.5pt + quiet)
#v(3pt)
#align(right)[#text(size: 9.5pt)[#contact-line(sep: " | ")]]

#if doc.headline != "" [ #text(weight: "bold")[#doc.headline] ]
#if doc.summary != "" [ #v(6pt) #doc.summary ]

#if has(doc.skills) [
  #section("Skills and Accomplishments")
  #for line in skills-lines() [ #block(inset: (left: 16pt), above: 4pt, below: 4pt)[• #line] ]
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
      text[#{
        let parts = (upper(school.credential), school.institution, school.location).filter(p => p != "")
        parts.join(" | ")
      }],
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
