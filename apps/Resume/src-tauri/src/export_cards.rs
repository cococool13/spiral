//! Writes one SVG per template for the website's scroll sequence. Not shipped.
//!
//!   CARD_OUT=/path/to/dir cargo test --release export_cards -- --ignored
#[cfg(test)]
mod export {
    const SAMPLE: &str = "\
Ada Lovelace
ada@example.com · (555) 123-4567 · London

SUMMARY
Analytical engine programmer with a bias for provable results.

EXPERIENCE
Analyst, Admiralty
Jan 2021 - Present
- Wrote the first published algorithm
- Cut report turnaround from 9 days to 2
- Managed a team of 6 engineers over 18 months

Intern, Difference Works
Jun 2020 - Dec 2020
- Checked 400 tables of logarithms

EDUCATION
University of London
BSc Mathematics
2016 - 2019
- Coursework: analysis, number theory

SKILLS
Technical: Rust, Analysis, Notation
Languages: French, German
";

    #[test]
    #[ignore]
    fn write_cards() {
        let out = std::path::PathBuf::from(std::env::var("CARD_OUT").unwrap());
        std::fs::create_dir_all(&out).unwrap();
        let doc = crate::parse_text::parse_text(SAMPLE);
        for template in crate::templates::all() {
            let pages = crate::templates::to_svg_pages(template, &doc, "ink").unwrap();
            let path = out.join(format!("{}.svg", template.id));
            std::fs::write(&path, &pages[0]).unwrap();
            println!("{:>9} kB  {}", pages[0].len() / 1024, path.display());
        }
    }
}
