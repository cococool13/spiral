//! Which section a line names, in the several languages and many spellings
//! resumes use — and the split of a document into those sections.

use super::lines::is_bullet;
use std::sync::OnceLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Section {
    Summary,
    Experience,
    Education,
    Projects,
    Skills,
    Leadership,
    Awards,
    Interests,
}

/// Headings people actually type, in the normalised form `heading_key`
/// produces: lowercase, `&` spelled out, single spaces. Anything not here is
/// body text.
pub(super) const HEADINGS: &[(&str, Section)] = &[
    ("summary", Section::Summary),
    ("professional summary", Section::Summary),
    ("career summary", Section::Summary),
    ("summary of qualifications", Section::Summary),
    ("profile", Section::Summary),
    ("professional profile", Section::Summary),
    ("objective", Section::Summary),
    ("career objective", Section::Summary),
    ("about", Section::Summary),
    ("about me", Section::Summary),
    ("experience", Section::Experience),
    ("work experience", Section::Experience),
    ("work history", Section::Experience),
    ("professional experience", Section::Experience),
    ("relevant experience", Section::Experience),
    ("industry experience", Section::Experience),
    ("research experience", Section::Experience),
    ("internships", Section::Experience),
    ("employment", Section::Experience),
    ("employment history", Section::Experience),
    ("education", Section::Education),
    ("academic background", Section::Education),
    ("education and training", Section::Education),
    ("projects", Section::Projects),
    ("personal projects", Section::Projects),
    ("selected projects", Section::Projects),
    ("academic projects", Section::Projects),
    ("key projects", Section::Projects),
    ("skills", Section::Skills),
    ("languages", Section::Skills),
    ("language skills", Section::Skills),
    ("languages spoken", Section::Skills),
    ("technical skills", Section::Skills),
    ("technical proficiencies", Section::Skills),
    ("core skills", Section::Skills),
    ("core competencies", Section::Skills),
    ("competencies", Section::Skills),
    ("areas of expertise", Section::Skills),
    ("tools and technologies", Section::Skills),
    ("skills and interests", Section::Skills),
    ("skills and accomplishments", Section::Skills),
    ("skills and proficiencies", Section::Skills),
    ("top skills", Section::Skills),
    ("leadership", Section::Leadership),
    ("leadership experience", Section::Leadership),
    ("leadership and activities", Section::Leadership),
    ("leadership activities", Section::Leadership),
    ("activities", Section::Leadership),
    ("activities and extracurriculars", Section::Leadership),
    ("extracurriculars", Section::Leadership),
    ("volunteer experience", Section::Leadership),
    ("volunteering", Section::Leadership),
    ("volunteer work", Section::Leadership),
    ("community involvement", Section::Leadership),
    ("campus involvement", Section::Leadership),
    ("awards", Section::Awards),
    ("certifications", Section::Awards),
    ("certificates", Section::Awards),
    ("licences", Section::Awards),
    ("licenses", Section::Awards),
    ("professional certifications", Section::Awards),
    ("honors", Section::Awards),
    ("honours", Section::Awards),
    ("achievements", Section::Awards),
    ("accomplishments", Section::Awards),
    ("awards and accomplishments", Section::Awards),
    ("honors and awards", Section::Awards),
    ("awards and honors", Section::Awards),
    ("interests", Section::Interests),
    ("personal interests", Section::Interests),
    ("hobbies", Section::Interests),
    ("hobbies and interests", Section::Interests),
];

/// The same headings in the languages a resume most often arrives in besides
/// English. Only the section names are translated — dates and the rest of the
/// parser are language-neutral already, and a heading nobody matches is the one
/// failure that loses a whole section rather than one line.
pub(super) const FOREIGN_HEADINGS: &[(&str, Section)] = &[
    // Spanish
    ("perfil profesional", Section::Summary),
    ("resumen", Section::Summary),
    ("objetivo", Section::Summary),
    ("experiencia", Section::Experience),
    ("experiencia laboral", Section::Experience),
    ("experiencia profesional", Section::Experience),
    ("educacion", Section::Education),
    ("formacion academica", Section::Education),
    ("habilidades", Section::Skills),
    ("competencias", Section::Skills),
    ("aptitudes", Section::Skills),
    ("idiomas", Section::Skills),
    ("proyectos", Section::Projects),
    ("premios", Section::Awards),
    ("logros", Section::Awards),
    ("voluntariado", Section::Leadership),
    ("intereses", Section::Interests),
    // French
    ("profil", Section::Summary),
    ("experience", Section::Experience),
    ("experience professionnelle", Section::Experience),
    ("experiences professionnelles", Section::Experience),
    ("parcours professionnel", Section::Experience),
    ("formation", Section::Education),
    ("formations", Section::Education),
    ("diplomes", Section::Education),
    ("competences", Section::Skills),
    ("langues", Section::Skills),
    ("projets", Section::Projects),
    ("distinctions", Section::Awards),
    ("benevolat", Section::Leadership),
    ("centres d interet", Section::Interests),
    ("loisirs", Section::Interests),
    // German
    ("kurzprofil", Section::Summary),
    ("berufserfahrung", Section::Experience),
    ("beruflicher werdegang", Section::Experience),
    ("praktika", Section::Experience),
    ("ausbildung", Section::Education),
    ("bildung", Section::Education),
    ("studium", Section::Education),
    ("kenntnisse", Section::Skills),
    ("faehigkeiten", Section::Skills),
    ("sprachen", Section::Skills),
    ("projekte", Section::Projects),
    ("auszeichnungen", Section::Awards),
    ("ehrenamt", Section::Leadership),
    ("interessen", Section::Interests),
    // Portuguese and Italian
    ("experiencia profissional", Section::Experience),
    ("formacao", Section::Education),
    ("esperienza", Section::Experience),
    ("esperienza professionale", Section::Experience),
    ("istruzione", Section::Education),
    ("formazione", Section::Education),
    ("competenze", Section::Skills),
    ("lingue", Section::Skills),
];

/// All-caps forms of every heading, longest first. PDF extraction glues a
/// heading onto the words beside it; finding the caps form is what cuts it
/// back out. "AND" headings also match the "&" the templates print.
pub(super) fn all_caps_needles() -> &'static [String] {
    static NEEDLES: OnceLock<Vec<String>> = OnceLock::new();
    NEEDLES.get_or_init(|| {
        let mut out: Vec<String> = HEADINGS
            .iter()
            .chain(FOREIGN_HEADINGS)
            .map(|(name, _)| name.to_uppercase())
            .collect();
        let ampersand: Vec<String> = out
            .iter()
            .filter(|name| name.contains(" AND "))
            .map(|name| name.replace(" AND ", " & "))
            .collect();
        out.extend(ampersand);
        out.sort_by_key(|name| std::cmp::Reverse(name.len()));
        out.dedup();
        out
    })
}

/// Accents are stripped before a heading is matched, so one spelling of
/// "EDUCACIÓN" covers the one somebody typed without the accent too — and the
/// tables above stay ASCII, which is what makes them readable.
pub(super) fn without_accents(key: &str) -> String {
    key.chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' | 'å' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            other => other,
        })
        .collect::<String>()
        .replace('ß', "ss")
        .replace('æ', "ae")
        .replace('ø', "o")
}

/// One spelling for the many ways a heading arrives: any case, wrapped in
/// punctuation, `&` or "and", and the double spaces PDF extraction leaves
/// behind.
pub(super) fn heading_key(line: &str) -> String {
    let lowered = line.to_lowercase().replace('&', " and ");
    lowered
        .split_whitespace()
        // A word of pure punctuation is the rule Word draws under a heading —
        // and it arrives broken into several pieces, because the tabs between
        // them are now spaces.
        .map(|word| word.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn section_named(key: &str) -> Option<Section> {
    // The cap is on the normalised key, not the line: a Word heading ruled off
    // with underscores is sixty characters of which twenty are the heading.
    if key.chars().count() > 32 {
        return None;
    }
    let folded = without_accents(key);
    HEADINGS
        .iter()
        .chain(FOREIGN_HEADINGS)
        .find(|(name, _)| *name == key || *name == folded)
        .map(|(_, section)| *section)
        .or_else(|| spaceless_heading(key))
}

/// Letter-spacing with no word-gap left "W O R K E X P E R I E N C E" as one
/// token, `WORKEXPERIENCE`. That is still the heading; the importer must not
/// be the one that knows.
fn spaceless_heading(key: &str) -> Option<Section> {
    if key.contains(' ') {
        return None;
    }
    HEADINGS
        .iter()
        .chain(FOREIGN_HEADINGS)
        .find(|(name, _)| name.chars().filter(|c| *c != ' ').eq(key.chars()))
        .map(|(_, section)| *section)
}

/// A heading matches the list and is not a bullet. A bulleted line that reads
/// "Skills:" or "Experience" is an achievement someone wrote, and promoting it
/// to a heading cuts the entry it belongs to in half.
pub(super) fn heading_of(line: &str) -> Option<Section> {
    if is_bullet(line) {
        return None;
    }
    section_named(&heading_key(line))
}

/// "Professional Summary: Ten years in analysis." is a heading and the first
/// line of its body on one line, which is how Word's own templates write it.
pub(super) fn heading_with_text(line: &str) -> Option<(Section, String)> {
    if is_bullet(line) {
        return None;
    }
    let (head, rest) = line.split_once(':')?;
    let rest = rest.trim();
    if rest.is_empty() {
        return None;
    }
    Some((section_named(&heading_key(head))?, rest.to_string()))
}

pub fn split_sections(lines: &[String]) -> (Vec<String>, Vec<(Section, Vec<String>)>) {
    let mut header = Vec::new();
    let mut sections: Vec<(Section, Vec<String>)> = Vec::new();
    for line in lines {
        let opened = match heading_of(line) {
            Some(section) => Some((section, None)),
            None => heading_with_text(line).map(|(section, rest)| (section, Some(rest))),
        };
        match opened {
            Some((section, first)) => sections.push((section, first.into_iter().collect())),
            None => match sections.last_mut() {
                Some((_, body)) => body.push(line.clone()),
                None => header.push(line.clone()),
            },
        }
    }
    (header, sections)
}

/// A heading that appears twice — which is what a multi-page PDF gives you when
/// a section carries on over the page break — adds to what the first one held.
/// Assigning each section in turn instead means the second "EXPERIENCE" silently
/// replaces every role above it.
pub(super) fn merge_repeats(sections: Vec<(Section, Vec<String>)>) -> Vec<(Section, Vec<String>)> {
    let mut merged: Vec<(Section, Vec<String>)> = Vec::new();
    for (section, body) in sections {
        match merged.iter_mut().find(|(kind, _)| *kind == section) {
            Some((_, first)) => first.extend(body),
            None => merged.push((section, body)),
        }
    }
    merged
}
