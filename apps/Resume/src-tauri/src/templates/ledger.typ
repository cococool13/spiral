// Ledger — a narrow left rail carries the dates, the body sits on the right.
// Two columns with no interleaving, which is what keeps it expressible in Word.

#set page(paper: "us-letter", margin: (x: 52pt, y: 52pt))
#set text(font: "Liberation Serif", size: 10.5pt, fill: rgb("#111111"))
#set par(justify: false, leading: 0.62em, spacing: 0.85em)

#let rail = 96pt

#let row(left-text, body) = grid(
  columns: (rail, 1fr),
  column-gutter: 14pt,
  align: (right, left),
  text(size: 9pt, fill: quiet)[#left-text],
  body,
)

#let section(title) = {
  v(8pt)
  row(text(size: 9pt, weight: "bold", tracking: 0.06em, fill: accent)[#upper(title)], [])
  v(-6pt)
}

#row(
  [],
  [
    #text(size: 18pt, weight: "bold")[#doc.contact.name]
    #if contact-line() != "" [
      #linebreak()
      #text(size: 9.5pt, fill: quiet)[#contact-line(sep: "  ·  ")]
    ]
  ],
)

#if doc.summary != "" [
  #section("Summary")
  #row([], doc.summary)
]

#if has(doc.experience) [
  #section("Experience")
  #for role in doc.experience [
    #row(
      date-range(role.start, role.end),
      [
        #text(weight: "bold")[#role-heading(role)]
        #for bullet in bullets-of(role) [
          #block(above: 3pt, below: 3pt)[• #bullet]
        ]
      ],
    )
    #v(5pt)
  ]
]

#if has(doc.projects) [
  #section("Projects")
  #for role in doc.projects [
    #row(
      date-range(role.start, role.end),
      [
        #text(weight: "bold")[#role-heading(role)]
        #for bullet in bullets-of(role) [
          #block(above: 3pt, below: 3pt)[• #bullet]
        ]
      ],
    )
    #v(5pt)
  ]
]

#if has(doc.education) [
  #section("Education")
  #for school in doc.education [
    #row(
      date-range(school.start, school.end),
      [
        #text(weight: "bold")[#school.institution]
        #if school.credential != "" [
          #linebreak()
          #school.credential
        ]
      ],
    )
    #v(4pt)
  ]
]

#if has(doc.skills) [
  #section("Skills")
  #row([], doc.skills.join(" · "))
]
