//! Canonical sample resume used by FACTS checks and thumbnails. One source so
//! the Word/PDF twin test and the style picker cannot invent different people.

use crate::model::ResumeDoc;

/// One fact from every section, in one list, so the Word check and the
/// PDF/Word twin check cannot test different things. A section missing from
/// here is a section a template may silently stop rendering.
pub const FACTS: [&str; 21] = [
    "Ada Lovelace",
    "ada@example.com",
    "London",
    "Analyst",
    "Admiralty",
    "Portsmouth",
    "Jan 2021",
    "Present",
    "Wrote the first algorithm",
    "Difference Engine",
    "Drafted the notes",
    "University of London",
    "BSc Mathematics",
    "Cambridge",
    "GPA 3.9",
    "President",
    "Mathematical Society",
    "Ran a weekly seminar",
    "De Morgan Medal",
    "Rust",
    "Weaving",
];

/// A full enough sample that every template has sections to show. It is also
/// the document `FACTS` is drawn from — keep them in lockstep.
pub fn sample_resume() -> ResumeDoc {
    crate::parse_text::parse_text(
        "Ada Lovelace\nada@example.com · London\n\n\
         EXPERIENCE\nAnalyst, Admiralty\nPortsmouth\nJan 2021 - Present\n\
         - Wrote the first algorithm\n\n\
         PROJECTS\nDifference Engine\n- Drafted the notes\n\n\
         EDUCATION\nUniversity of London\nBSc Mathematics\nCambridge\n2016 - 2019\n- GPA 3.9\n\n\
         LEADERSHIP & ACTIVITIES\nPresident, Mathematical Society\n- Ran a weekly seminar\n\n\
         AWARDS\nDe Morgan Medal\n\nSKILLS\nRust, Analysis\n\nINTERESTS\nWeaving\n",
    )
}
