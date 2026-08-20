//! Date, role, and contact strings for the Word exporter. Keep lockstep with
//! `prelude.typ`.

use crate::model::{ResumeDoc, Role};

/// Matches `prelude.typ`'s `date-range`.
pub fn date_range(role_start: &str, role_end: &str, present: bool) -> String {
    let end = if present && role_end.is_empty() {
        "Present"
    } else {
        role_end
    };
    match (role_start.is_empty(), end.is_empty()) {
        (true, true) => String::new(),
        (true, false) => end.to_string(),
        (false, true) => role_start.to_string(),
        (false, false) => format!("{role_start} — {end}"),
    }
}

pub fn role_heading(role: &Role) -> String {
    [role.title.as_str(), role.organization.as_str()]
        .iter()
        .filter(|part| !part.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn contact_line(doc: &ResumeDoc) -> String {
    let mut parts = vec![
        doc.contact.email.clone(),
        doc.contact.phone.clone(),
        doc.contact.location.clone(),
    ];
    parts.extend(doc.contact.links.iter().cloned());
    parts
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
}

/// Matches `prelude.typ`'s `when-and-where`.
pub fn when_and_where(dates: &str, location: &str) -> String {
    [dates, location]
        .iter()
        .filter(|part| !part.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join(" · ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_match_typst_prelude() {
        assert_eq!(date_range("Jan 2021", "", true), "Jan 2021 — Present");
        assert_eq!(date_range("2016", "2019", false), "2016 — 2019");
        assert_eq!(date_range("", "", false), "");
        assert_eq!(date_range("2019", "", false), "2019");
    }
}
