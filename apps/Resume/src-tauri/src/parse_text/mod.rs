//! Plain text in, `ResumeDoc` out. Pure — no I/O, no clock, no randomness, so
//! the same paste always produces the same document.
//!
//! This parser is deliberately conservative. Anything it is unsure about it
//! leaves in place rather than guessing, because the Check screen is where a
//! human resolves ambiguity and a confident wrong guess is worse than a blank.
//!
//! The work splits into five stages, one module each: `lines` repairs how the
//! text arrived, `headings` decides which section a line names, `contact` reads
//! the block at the top, `dates` reads a range as written, and `entries` builds
//! the roles and schools. This file is only the order they run in.

mod contact;
mod dates;
mod entries;
mod headings;
mod lines;

use crate::model::ResumeDoc;
use contact::{fill_missing_contact, parse_contact};
use dates::{parse_date_range, without_dates};
use entries::{parse_lines, parse_skills, roles_of, schools_of};
use headings::{merge_repeats, split_sections, Section};
use lines::{bullet_text, is_bullet, lines_of};

/// Where the contact block stops and the first job starts, in a resume that
/// names no sections at all. The first entry is the line above the first date
/// range or bullet — nobody's address has either in it.
fn first_entry_line(lines: &[String]) -> Option<usize> {
    let detail = lines
        .iter()
        .position(|line| is_bullet(line) || parse_date_range(line).is_some())?;
    // A date on the heading line itself means the entry starts there.
    Some(match parse_date_range(&lines[detail]) {
        Some((start, end)) if !without_dates(&lines[detail], &start, &end).is_empty() => detail,
        _ => detail.saturating_sub(1),
    })
}

pub fn parse_text(input: &str) -> ResumeDoc {
    let lines = lines_of(input);
    if lines.is_empty() {
        return ResumeDoc::empty();
    }
    let (mut header, mut sections) = split_sections(&lines);
    // No headings anywhere. Everything from the first job down is experience;
    // reading the whole page as a contact block would lose every role on it.
    if sections.is_empty() {
        match first_entry_line(&header) {
            Some(at) => {
                let body = header.split_off(at);
                sections.push((Section::Experience, body));
            }
            None => header = lines.clone(),
        }
    }
    let header = parse_contact(&header);
    let mut doc = ResumeDoc {
        contact: header.contact,
        // A paragraph above the first heading is the summary nobody labelled.
        // A labelled one, if the resume has one, replaces it below.
        summary: header.prose.join(" "),
        ..ResumeDoc::empty()
    };
    for (section, body) in &merge_repeats(sections) {
        match section {
            Section::Summary => {
                doc.summary = body
                    .iter()
                    .map(|line| bullet_text(line))
                    .collect::<Vec<_>>()
                    .join(" ")
            }
            Section::Skills => doc.skills = parse_skills(body),
            Section::Experience => doc.experience = roles_of(body, "exp"),
            Section::Projects => doc.projects = roles_of(body, "proj"),
            Section::Leadership => doc.leadership = roles_of(body, "lead"),
            Section::Education => doc.education = schools_of(body),
            Section::Awards => doc.awards = parse_lines(body),
            Section::Interests => doc.interests = parse_lines(body),
        }
    }
    fill_missing_contact(&mut doc.contact, &lines);
    doc
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::headings::*;
    use super::lines::*;

    #[test]
    fn reads_the_name_from_the_first_line() {
        let doc = parse_text("Ada Lovelace\nada@example.com\n");
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }

    #[test]
    fn finds_email_and_phone_anywhere_in_the_header() {
        let doc = parse_text("Ada Lovelace\nLondon · (555) 123-4567 · ada@example.com\n");
        assert_eq!(doc.contact.email, "ada@example.com");
        assert_eq!(doc.contact.phone, "(555) 123-4567");
    }

    /// Whatever is left on a header line after the email, phone and links have
    /// been taken is almost always the place the person lives. Dropping it
    /// would lose text the user typed, which is the one thing this parser must
    /// never do.
    #[test]
    fn keeps_the_leftover_header_text_as_a_location() {
        let doc = parse_text("Ada Lovelace\nLondon · (555) 123-4567 · ada@example.com\n");
        assert_eq!(doc.contact.location, "London");
    }

    /// Many templates put the whole contact block on line one. Taking that
    /// line whole would make all of it the person's name.
    #[test]
    fn a_name_sharing_its_line_with_contact_details_is_read_alone() {
        let doc = parse_text("Ada Lovelace | 12 Acacia Ave | (555) 123-4567 | ada@example.com\n");
        assert_eq!(doc.contact.name, "Ada Lovelace");
        assert_eq!(doc.contact.email, "ada@example.com");
    }

    /// Splitting the name off line one must not discard the rest of it: a
    /// title or a city sharing that line has nowhere else to go.
    #[test]
    fn text_after_the_name_on_line_one_is_kept_rather_than_dropped() {
        let doc = parse_text("Ada Lovelace | Senior Engineer | ada@example.com\n");
        assert_eq!(doc.contact.name, "Ada Lovelace");
        assert_eq!(doc.contact.email, "ada@example.com");
        assert_eq!(doc.contact.location, "Senior Engineer");
    }

    #[test]
    fn a_hyphenated_name_is_not_split() {
        let doc = parse_text("Anne-Marie Saint-Clair\nanne@example.com\n");
        assert_eq!(doc.contact.name, "Anne-Marie Saint-Clair");
    }

    #[test]
    fn a_name_with_a_spaced_dash_before_details_is_split_there() {
        let doc = parse_text("Ada Lovelace - ada@example.com\n");
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }

    #[test]
    fn does_not_mistake_the_name_line_for_a_location() {
        let doc = parse_text("Ada Lovelace\nada@example.com\n");
        assert_eq!(doc.contact.location, "");
    }

    #[test]
    fn collects_links_and_ignores_the_email_as_a_link() {
        let doc = parse_text("Ada Lovelace\nada@example.com\ngithub.com/ada\n");
        assert_eq!(doc.contact.links, vec!["github.com/ada".to_string()]);
    }

    #[test]
    fn empty_input_gives_an_empty_document() {
        assert_eq!(parse_text("   \n\n"), crate::model::ResumeDoc::empty());
    }

    const SAMPLE: &str = "\
Ada Lovelace
ada@example.com

SUMMARY
Analytical engine programmer.

EXPERIENCE
Analyst, Admiralty
Jan 2021 - Present
- Wrote the first algorithm

EDUCATION
University of London
BSc Mathematics, 2019

SKILLS
Rust, Analysis, Notation
";

    #[test]
    fn splits_into_the_sections_it_recognises() {
        let lines = lines_of(SAMPLE);
        let (header, sections) = split_sections(&lines);
        assert_eq!(header, vec!["Ada Lovelace", "ada@example.com"]);
        let kinds: Vec<Section> = sections.iter().map(|(k, _)| *k).collect();
        assert_eq!(
            kinds,
            vec![
                Section::Summary,
                Section::Experience,
                Section::Education,
                Section::Skills
            ]
        );
    }

    #[test]
    fn heading_matching_ignores_case_and_punctuation() {
        let lines = lines_of("Ada\n\nWork Experience:\nAnalyst\n");
        let (_, sections) = split_sections(&lines);
        assert_eq!(sections[0].0, Section::Experience);
    }

    #[test]
    fn a_long_line_is_body_text_not_a_heading() {
        let long = "Experience building distributed systems across three teams and two continents";
        let lines = lines_of(&format!("Ada\n\nSUMMARY\n{long}\n"));
        let (_, sections) = split_sections(&lines);
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].1, vec![long.to_string()]);
    }





    #[test]
    fn summary_and_skills_land_on_the_document() {
        let doc = parse_text(SAMPLE);
        assert_eq!(doc.summary, "Analytical engine programmer.");
        assert_eq!(doc.skills.len(), 1);
        assert_eq!(doc.skills[0].label, "");
        assert_eq!(doc.skills[0].items, vec!["Rust", "Analysis", "Notation"]);
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }

    #[test]
    fn builds_a_role_from_a_title_line_a_date_line_and_bullets() {
        let doc = parse_text(SAMPLE);
        assert_eq!(doc.experience.len(), 1);
        let role = &doc.experience[0];
        assert_eq!(role.title, "Analyst");
        assert_eq!(role.organization, "Admiralty");
        assert_eq!(role.start.year, Some(2021));
        assert!(role.end.present);
        assert_eq!(role.bullets.len(), 1);
        assert_eq!(role.bullets[0].text, "Wrote the first algorithm");
        assert_eq!(role.bullets[0].id, "exp-0-b-0");
        assert_eq!(role.id, "exp-0");
    }

    #[test]
    fn a_date_on_the_same_line_as_the_title_still_works() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty (Jan 2021 - Mar 2023)\n- Did the work\n",
        );
        let role = &doc.experience[0];
        assert_eq!(role.title, "Analyst");
        assert_eq!(role.organization, "Admiralty");
        assert_eq!(role.end.year, Some(2023));
        assert_eq!(role.bullets.len(), 1);
    }

    #[test]
    fn a_second_entry_starts_at_the_next_non_bullet_line() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2023\n- One\nIntern, Works\n2020 - 2021\n- Two\n",
        );
        assert_eq!(doc.experience.len(), 2);
        assert_eq!(doc.experience[1].title, "Intern");
        assert_eq!(doc.experience[1].bullets[0].id, "exp-1-b-0");
    }

    #[test]
    fn labelled_skill_lines_become_groups() {
        let doc = parse_text(
            "Ada\n\nSKILLS\nTechnical: Rust, Python\nLanguage: French, Latin\n",
        );
        assert_eq!(doc.skills.len(), 2);
        assert_eq!(doc.skills[0].label, "Technical");
        assert_eq!(doc.skills[0].items, vec!["Rust", "Python"]);
        assert_eq!(doc.skills[1].label, "Language");
    }

    /// A sentence that happens to contain a colon is not a category.
    #[test]
    fn a_long_phrase_before_a_colon_is_not_a_label() {
        let doc = parse_text(
            "Ada\n\nSKILLS\nThings I have used across many teams: Rust, Python\n",
        );
        assert_eq!(doc.skills.len(), 1);
        assert_eq!(doc.skills[0].label, "");
    }

    #[test]
    fn leadership_awards_and_interests_are_parsed() {
        let doc = parse_text(
            "Ada\n\nLEADERSHIP & ACTIVITIES\nPresident, Chess Club\n2021 - 2022\n- Ran the league\n\nAWARDS\nDean's List\nDe Morgan Medal\n\nINTERESTS\nWeaving, Number theory\n",
        );
        assert_eq!(doc.leadership.len(), 1);
        assert_eq!(doc.leadership[0].title, "President");
        assert_eq!(doc.leadership[0].id, "lead-0");
        assert_eq!(doc.leadership[0].bullets[0].id, "lead-0-b-0");
        assert_eq!(doc.awards, vec!["Dean's List", "De Morgan Medal"]);
        assert_eq!(doc.interests, vec!["Weaving", "Number theory"]);
    }

    #[test]
    fn education_keeps_institution_and_credential() {
        let doc = parse_text(SAMPLE);
        assert_eq!(doc.education.len(), 1);
        assert_eq!(doc.education[0].institution, "University of London");
        assert_eq!(doc.education[0].credential, "BSc Mathematics, 2019");
        assert_eq!(doc.education[0].id, "edu-0");
    }

    /// The most common entry shape in the wild: the dates sit on the heading
    /// line and the office sits on the line below it. That location line used to
    /// begin a second, phantom role and take the bullets with it.
    #[test]
    fn a_location_under_a_dated_heading_stays_in_the_same_role() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty  Jan 2021 - Present\nLondon, UK\n- Wrote the first algorithm\n",
        );
        assert_eq!(doc.experience.len(), 1, "split into phantom roles");
        assert_eq!(doc.experience[0].title, "Analyst");
        assert_eq!(doc.experience[0].organization, "Admiralty");
        assert_eq!(doc.experience[0].location, "London, UK");
        assert_eq!(doc.experience[0].bullets.len(), 1);
    }

    /// The same rule must not glue two dated headings together.
    #[test]
    fn two_dated_headings_in_a_row_are_two_roles() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty  2021 - 2023\nIntern, Works  2019 - 2021\n",
        );
        assert_eq!(doc.experience.len(), 2);
        assert_eq!(doc.experience[1].title, "Intern");
    }





    /// PDF pages repeat their headings. Reading the second one used to replace
    /// everything the first one held.
    #[test]
    fn a_second_heading_of_the_same_kind_adds_to_the_first() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2023\n- One\n\nEXPERIENCE\nIntern, Works\n2019 - 2021\n- Two\n",
        );
        assert_eq!(doc.experience.len(), 2);
        assert_eq!(doc.experience[1].title, "Intern");
        assert_eq!(doc.experience[1].bullets[0].id, "exp-1-b-0");
    }

    /// Nothing the user typed may be dropped. An extra line under a role has to
    /// land somewhere the Check screen can show it.
    #[test]
    fn extra_lines_under_a_role_are_kept() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst\nAdmiralty\nLondon, UK\nContract, three days a week\nJan 2021 - Present\n- Wrote it\n",
        );
        let role = &doc.experience[0];
        assert_eq!(role.title, "Analyst");
        assert_eq!(role.organization, "Admiralty");
        assert_eq!(role.location, "London, UK");
        assert!(
            role.bullets.iter().any(|b| b.text == "Contract, three days a week"),
            "a line was dropped: {:?}",
            role.bullets
        );
    }

    #[test]
    fn extra_lines_under_a_school_are_kept() {
        let doc = parse_text(
            "Ada\n\nEDUCATION\nUniversity of London\nBSc Mathematics\nLondon, UK\nThesis on the analytical engine\n",
        );
        let school = &doc.education[0];
        assert_eq!(school.institution, "University of London");
        assert_eq!(school.credential, "BSc Mathematics");
        assert_eq!(school.location, "London, UK");
        assert_eq!(school.notes[0].text, "Thesis on the analytical engine");
    }

    #[test]
    fn a_third_header_line_is_kept_beside_the_second() {
        let doc = parse_text("Ada Lovelace\nLondon, UK\nOpen to relocation\nada@example.com\n");
        assert_eq!(doc.contact.location, "London, UK · Open to relocation");
    }

    #[test]
    fn an_international_number_is_read_as_a_phone() {
        let doc = parse_text("Ada Lovelace\n+44 20 7946 0958 · ada@example.com\n");
        assert_eq!(doc.contact.phone, "+44 20 7946 0958");
        assert_eq!(doc.contact.location, "");
    }

    /// A street number is not a phone number.
    #[test]
    fn an_address_is_not_read_as_a_phone() {
        let doc = parse_text("Ada Lovelace\n12 Acacia Avenue, London\n");
        assert_eq!(doc.contact.phone, "");
        assert_eq!(doc.contact.location, "12 Acacia Avenue, London");
    }

    /// A bullet glyph alone on a line is what PDF extraction produces. It
    /// belongs to the sentence under it.
    #[test]
    fn a_bullet_mark_alone_on_a_line_joins_the_line_below() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2023\n•\nWrote the first algorithm\n",
        );
        assert_eq!(doc.experience[0].bullets.len(), 1);
        assert_eq!(doc.experience[0].bullets[0].text, "Wrote the first algorithm");
    }

    /// Word writes its bullets in a symbol font, which arrives as a private-use
    /// character rather than a dash.
    #[test]
    fn word_and_pdf_bullet_glyphs_are_read_as_bullets() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2023\n\u{f0b7} Wrote it\n▪ Shipped it\n",
        );
        assert_eq!(doc.experience[0].bullets.len(), 2);
        assert_eq!(doc.experience[0].bullets[0].text, "Wrote it");
        assert_eq!(doc.experience[0].bullets[1].text, "Shipped it");
    }

    #[test]
    fn an_ampersand_heading_matches_its_spelled_out_twin() {
        let doc = parse_text("Ada\n\nHONORS & AWARDS\nDean's List\n");
        assert_eq!(doc.awards, vec!["Dean's List"]);
    }

    /// Extractors leave double spaces inside headings.
    #[test]
    fn a_heading_with_ragged_spacing_still_matches() {
        let doc = parse_text("Ada\n\nWORK  HISTORY\nAnalyst, Admiralty\n");
        assert_eq!(doc.experience.len(), 1);
    }

    /// An award with a comma in it is one award, not two.
    #[test]
    fn awards_listed_one_per_line_are_never_split_on_their_commas() {
        let doc = parse_text("Ada\n\nAWARDS\nDean's List, Fall 2021\nDe Morgan Medal\n");
        assert_eq!(doc.awards, vec!["Dean's List, Fall 2021", "De Morgan Medal"]);
    }

    /// The word in front of a year is only part of the date when it is a month.
    /// It used to be swallowed whole, which deleted the employer from the page.
    #[test]
    fn the_word_before_a_year_is_kept_unless_it_is_a_month() {
        let doc = parse_text("Ada\n\nEXPERIENCE\nAnalyst, Acme 2021 - 2023\n- Did it\n");
        assert_eq!(doc.experience[0].title, "Analyst");
        assert_eq!(doc.experience[0].organization, "Acme");
        assert_eq!(doc.experience[0].start.raw, "2021");
        let (start, _) = parse_date_range("Acme 2021 - 2023").unwrap();
        assert_eq!(start.raw, "2021");
        assert_eq!(start.month, None);
    }

    /// Contact details do not always sit at the top. Losing an email address
    /// costs the user the job, so it is looked for everywhere before giving up.
    #[test]
    fn contact_details_are_found_below_the_first_heading_too() {
        let doc = parse_text(
            "Ada Lovelace\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2023\n- Did it\n\nCONTACT\nada@example.com | (555) 123-4567 | github.com/ada\n",
        );
        assert_eq!(doc.contact.email, "ada@example.com");
        assert_eq!(doc.contact.phone, "(555) 123-4567");
        assert_eq!(doc.contact.links, vec!["github.com/ada".to_string()]);
    }

    /// A resume with no headings at all: the roles are still roles.
    #[test]
    fn a_resume_with_no_headings_still_finds_its_roles() {
        let doc = parse_text(
            "Ada Lovelace\nada@example.com\n\nAnalyst, Admiralty\nJan 2021 - Present\n- Wrote the first algorithm\n\nIntern, Works\n2019 - 2020\n- Checked the tables\n",
        );
        assert_eq!(doc.contact.name, "Ada Lovelace");
        assert_eq!(doc.contact.email, "ada@example.com");
        assert_eq!(doc.experience.len(), 2);
        assert_eq!(doc.experience[0].organization, "Admiralty");
        assert_eq!(doc.experience[1].title, "Intern");
    }

    /// Pasted from a markdown file, which is how a developer keeps a resume.
    #[test]
    fn a_markdown_resume_reads_as_a_resume() {
        let doc = parse_text(
            "# Ada Lovelace\n**ada@example.com**\n\n## Experience\n**Analyst**, Admiralty\n*Jan 2021 - Present*\n\n1. Wrote the first algorithm\n2. Cut turnaround to 2 days\n",
        );
        assert_eq!(doc.contact.name, "Ada Lovelace");
        assert_eq!(doc.contact.email, "ada@example.com");
        assert_eq!(doc.experience.len(), 1);
        assert_eq!(doc.experience[0].title, "Analyst");
        assert_eq!(doc.experience[0].organization, "Admiralty");
        assert_eq!(doc.experience[0].bullets.len(), 2);
        assert_eq!(doc.experience[0].bullets[0].text, "Wrote the first algorithm");
    }

    /// "RESUME" across the top is a label on the page, not what anyone is called.
    #[test]
    fn a_document_title_is_not_read_as_the_name() {
        let doc = parse_text("CURRICULUM VITAE\nAda Lovelace\nada@example.com\n");
        assert_eq!(doc.contact.name, "Ada Lovelace");
        let doc = parse_text("Résumé\nAda Lovelace\n");
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }

    /// Whatever is submitted. None of these is a resume; none of them may take
    /// the app down, and all of them have to come back in reasonable time.
    #[test]
    fn nothing_thrown_at_the_parser_makes_it_panic() {
        let long_word = "x".repeat(200_000);
        let dashes = "-".repeat(20_000);
        let years = "2021-".repeat(8_000);
        let many_lines = "Analyst, Admiralty\n2021 - 2023\n- Did it\n".repeat(2_000);
        let cases = [
            "",
            "\0\0\0",
            "\u{feff}Ada Lovelace",
            "\r\n\r\n\r\n",
            "«»‹›〈〉《》",
            "🙂🙂🙂 · 🙂",
            "אדה לאבלייס\nada@example.com",
            "エイダ・ラブレス\n東京",
            ":::::::::",
            "EXPERIENCE\nEXPERIENCE\nEXPERIENCE",
            "- - - - - - - -",
            &long_word,
            &dashes,
            &years,
            &many_lines,
        ];
        for case in cases {
            let doc = parse_text(case);
            // Serializing proves the document is well formed, not merely built.
            serde_json::to_string(&doc).unwrap();
        }
    }

    /// A rule drawn out of underscores, and the page number in a footer. Both
    /// come out of a PDF as lines in the middle of a section, where they used to
    /// become an empty bullet or an entry with no name.
    #[test]
    fn page_furniture_is_not_content() {
        let doc = parse_text(
            "Ada Lovelace\n________________________\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2023\n- Wrote it\n-----\nPage 2 of 3\nIntern, Works\n2019 - 2020\n- Checked it\n",
        );
        assert_eq!(doc.experience.len(), 2);
        assert!(
            doc.roles().all(|r| r.bullets.iter().all(|b| !b.text.is_empty())),
            "an empty bullet survived: {:?}",
            doc.experience
        );
        assert_eq!(doc.experience[1].title, "Intern");
    }

    /// But a year alone on a line is a date, not a page number.
    #[test]
    fn a_bare_year_is_never_mistaken_for_page_furniture() {
        let doc = parse_text("Ada\n\nEDUCATION\nUniversity of London\nBSc Mathematics\n2019\n");
        assert_eq!(doc.education[0].credential, "BSc Mathematics");
        assert!(
            doc.education[0].notes.iter().any(|n| n.text == "2019")
                || doc.education[0].location == "2019",
            "the year was dropped: {:?}",
            doc.education[0]
        );
    }

    /// Word's second bullet level is the letter o in a symbol font, and that is
    /// exactly what comes out of a PDF: "o Managed the team".
    #[test]
    fn a_word_sub_bullet_is_a_bullet() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2023\n- Ran the office\no Managed the team\n",
        );
        assert_eq!(doc.experience[0].bullets.len(), 2);
        assert_eq!(doc.experience[0].bullets[1].text, "Managed the team");
    }

    /// A resume written in another language is still a resume.
    #[test]
    fn headings_in_other_languages_are_recognised() {
        let doc = parse_text(
            "Ada Lovelace\n\nEXPERIENCIA LABORAL\nAnalista, Admiralty\n2021 - 2023\n- Escribió el primer algoritmo\n\nEDUCACIÓN\nUniversidad de Londres\n\nHABILIDADES\nRust, Análisis\n",
        );
        assert_eq!(doc.experience.len(), 1, "Spanish experience heading missed");
        assert_eq!(doc.education.len(), 1);
        assert_eq!(doc.skills[0].items.len(), 2);

        let doc = parse_text(
            "Ada Lovelace\n\nEXPÉRIENCE PROFESSIONNELLE\nAnalyste, Admiralty\n2021 - 2023\n- A écrit le premier algorithme\n\nFORMATION\nUniversité de Londres\n",
        );
        assert_eq!(doc.experience.len(), 1, "French experience heading missed");
        assert_eq!(doc.education.len(), 1);

        let doc = parse_text(
            "Ada Lovelace\n\nBERUFSERFAHRUNG\nAnalystin, Admiralty\n2021 - 2023\n- Schrieb den ersten Algorithmus\n\nAUSBILDUNG\nUniversität London\n",
        );
        assert_eq!(doc.experience.len(), 1, "German experience heading missed");
        assert_eq!(doc.education.len(), 1);
    }

    /// The promise, as a test: every line of a messy real-world resume comes
    /// out somewhere in the document. A parser that loses a line loses a job.
    #[test]
    fn nothing_in_a_messy_resume_is_dropped() {
        const MESSY: &str = "\
Ada Lovelace | Senior Analyst
London, UK | +44 20 7946 0958 | ada@example.com | github.com/ada
Analytical engine programmer with a decade of work across three teams and two continents.

WORK  HISTORY ______ ______
Analyst | Admiralty, London\t\t\tJan 2021–Present
Reporting to the Astronomer Royal on numerical methods and their publication schedule.
•
Wrote the first published algorithm
\u{f0b7} Cut report turnaround from 9 days to 2

Intern | Difference Works, Leeds\t\t\tJun 2020-Dec 2020
- Checked 400 tables of logarithms

EDUCATION
University of London
BSc Mathematics
London, UK
2016 - 2019
Thesis on the analytical engine

Honors & Awards
De Morgan Medal, 2019
Dean's List

Skills: Rust, Analysis, Notation
";
        let doc = parse_text(MESSY);
        let rendered = serde_json::to_string(&doc).unwrap();
        for line in MESSY.lines() {
            // A heading is structure, not content: it becomes the section it
            // names. Everything else has to survive verbatim.
            let content = match (heading_of(line), heading_with_text(line)) {
                (Some(_), _) => String::new(),
                (None, Some((_, rest))) => rest,
                _ => line.to_string(),
            };
            // A date range is stored as its two ends, so "2021–Present" is two
            // words however it was typed.
            for word in content
                .split(|c: char| c.is_whitespace() || "-–—|".contains(c))
                .filter(|w| w.chars().any(char::is_alphanumeric))
            {
                let word = word.trim_matches(|c: char| !c.is_alphanumeric());
                if word.is_empty() || word.chars().all(|c| BULLET_MARKS.contains(&c)) {
                    continue;
                }
                assert!(
                    rendered.contains(word),
                    "{word:?} was dropped\nfrom: {line}\ninto: {rendered}"
                );
            }
        }
        // And it is read as a resume, not as one long contact block.
        assert_eq!(doc.contact.name, "Ada Lovelace");
        assert_eq!(doc.contact.phone, "+44 20 7946 0958");
        assert_eq!(doc.experience.len(), 2);
        assert_eq!(doc.experience[0].organization, "Admiralty, London");
        assert_eq!(doc.experience[0].bullets.len(), 3);
        assert!(doc.experience[0].end.present);
        assert_eq!(doc.education.len(), 1);
        assert_eq!(doc.awards.len(), 2);
        assert_eq!(doc.skills[0].items.len(), 3);
    }

    /// Word templates rule a heading off with underscores, broken into pieces
    /// by the tabs between them. The rule is part of the line, and the line is
    /// still a heading.
    #[test]
    fn a_heading_ruled_off_with_underscores_is_still_a_heading() {
        let doc = parse_text(
            "Ada\n\nLEADERSHIP ACTIVITIES      ______ ______ ______\nPresident, Chess Club\n",
        );
        assert_eq!(doc.leadership.len(), 1);
        assert_eq!(doc.leadership[0].title, "President");
    }

    /// A tab run pushing a date to the right margin makes a heading line long.
    /// Length is how an entry heading is told from a sentence, so the padding
    /// has to go before anything measures it.
    #[test]
    fn a_line_padded_out_to_the_margin_is_measured_without_the_padding() {
        let pad = " ".repeat(70);
        let prose = "Described the work in a paragraph rather than in bullets, which is what the hybrid templates ask for.";
        let doc = parse_text(&format!(
            "Ada\n\nEXPERIENCE\nAnalyst | Admiralty, London{pad}(2021)\n{prose}\nIntern | Works, Leeds{pad}(2019)\n{prose}\n"
        ));
        assert_eq!(doc.experience.len(), 2, "padding hid the second role");
        assert_eq!(doc.experience[1].title, "Intern");
    }

    /// A bullet is never a heading, however much its text looks like one.
    #[test]
    fn a_bullet_that_reads_like_a_heading_stays_a_bullet() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2023\n- Experience\n- Skills: taught Rust to four teams\n",
        );
        assert_eq!(doc.experience.len(), 1);
        assert_eq!(doc.experience[0].bullets.len(), 2);
        assert!(doc.skills.is_empty());
    }

    /// "Summary: …" on one line is a heading and its first line of body.
    #[test]
    fn a_heading_sharing_its_line_with_the_text_under_it_is_still_a_heading() {
        let doc = parse_text(
            "Ada\n\nProfessional Summary: Ten years in analysis.\nLed three teams.\n",
        );
        assert_eq!(doc.summary, "Ten years in analysis. Led three teams.");
    }

    /// Entries written as a paragraph rather than bullets: the paragraph belongs
    /// to the entry above it, and the short line after it starts the next one.
    #[test]
    fn paragraph_entries_split_at_the_next_short_line() {
        let long = "Tailored every experience section to the job description and studied each listing to find what mattered most to the hiring manager.";
        let doc = parse_text(&format!(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty\nJan 2021 - Present\n{long}\nIntern, Works\nJan 2019 - Dec 2020\n{long}\n"
        ));
        assert_eq!(doc.experience.len(), 2);
        assert_eq!(doc.experience[1].title, "Intern");
        assert_eq!(doc.experience[0].bullets[0].text, long);
    }

    /// A paragraph under the name, with no heading over it, is the summary
    /// almost every time — and it is certainly not part of the address.
    #[test]
    fn a_paragraph_in_the_header_becomes_the_summary() {
        let long = "Analytical engine programmer with ten years of experience across three teams and two continents.";
        let doc = parse_text(&format!("Ada Lovelace\nLondon, UK\n{long}\nada@example.com\n"));
        assert_eq!(doc.contact.location, "London, UK");
        assert_eq!(doc.summary, long);
    }

    /// A real summary always wins over the guessed one.
    #[test]
    fn a_labelled_summary_beats_a_paragraph_in_the_header() {
        let long = "Analytical engine programmer with ten years of experience across three teams and two continents.";
        let doc = parse_text(&format!("Ada Lovelace\n{long}\n\nSUMMARY\nThe real one.\n"));
        assert_eq!(doc.summary, "The real one.");
    }

    #[test]
    fn a_summary_written_as_bullets_loses_its_marks() {
        let doc = parse_text("Ada\n\nSUMMARY\n- Ten years in analysis\n- Led three teams\n");
        assert_eq!(doc.summary, "Ten years in analysis Led three teams");
    }
}
