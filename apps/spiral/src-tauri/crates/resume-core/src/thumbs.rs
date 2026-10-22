use std::sync::Mutex;

use serde::Serialize;

use crate::model::ResumeDoc;
use crate::templates;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Thumbnail {
    pub id: String,
    pub name: String,
    pub svg: String,
    pub error: String,
}

pub fn render_all_thumbnails(doc: &ResumeDoc, accent: &str) -> Vec<Thumbnail> {
    let library = match templates::std_for(doc, accent) {
        Ok(library) => library,
        Err(message) => {
            return templates::all()
                .iter()
                .map(|template| failed_card(template, message.clone()))
                .collect();
        }
    };
    std::thread::scope(|scope| {
        let running: Vec<_> = templates::all()
            .iter()
            .map(|template| {
                let library = library.clone();
                scope.spawn(move || one_thumbnail(template, library))
            })
            .collect();
        running
            .into_iter()
            .map(|handle| {
                handle.join().unwrap_or_else(|_| Thumbnail {
                    id: String::new(),
                    name: String::new(),
                    svg: String::new(),
                    error: "This style could not be drawn. Choose another one.".to_string(),
                })
            })
            .collect()
    })
}

fn one_thumbnail(template: &templates::Template, library: crate::render::Std) -> Thumbnail {
    match templates::to_card(template, library) {
        Ok(Some(svg)) => Thumbnail {
            id: template.id.to_string(),
            name: template.name.to_string(),
            svg,
            error: String::new(),
        },
        Ok(None) => failed_card(
            template,
            "This style produced no pages. Choose another one.",
        ),
        Err(message) => failed_card(template, message),
    }
}

fn failed_card(template: &templates::Template, message: impl Into<String>) -> Thumbnail {
    Thumbnail {
        id: template.id.to_string(),
        name: template.name.to_string(),
        svg: String::new(),
        error: message.into(),
    }
}

pub fn cached_or_render(
    cache: &Mutex<Option<(String, ResumeDoc, Vec<Thumbnail>)>>,
    doc: ResumeDoc,
    accent: &str,
) -> Vec<Thumbnail> {
    {
        let guard = cache.lock().unwrap_or_else(|poison| poison.into_inner());
        if let Some((cached_accent, cached_doc, thumbs)) = guard.as_ref() {
            if cached_accent == accent && cached_doc == &doc {
                return thumbs.clone();
            }
        }
    }
    let thumbs = render_all_thumbnails(&doc, accent);
    *cache.lock().unwrap_or_else(|poison| poison.into_inner()) =
        Some((accent.to_string(), doc, thumbs.clone()));
    thumbs
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures;

    #[test]
    fn thumbnails_come_back_one_per_template_as_svg() {
        let thumbs = render_all_thumbnails(&fixtures::sample_resume(), "ink");
        assert_eq!(thumbs.len(), 12);
        for thumb in &thumbs {
            assert!(
                thumb.error.is_empty(),
                "{} errored: {}",
                thumb.id,
                thumb.error
            );
            assert!(thumb.svg.starts_with("<svg"), "{} is not an SVG", thumb.id);
            assert!(!thumb.name.is_empty());
        }
    }

    #[test]
    fn a_thumbnail_is_the_sample_not_an_empty_page() {
        let sample = render_all_thumbnails(&fixtures::sample_resume(), "ink");
        let blank = render_all_thumbnails(&ResumeDoc::empty(), "ink");
        for (a, b) in sample.iter().zip(blank.iter()) {
            assert_ne!(
                a.svg, b.svg,
                "{} drew the sample the same as an empty page",
                a.id
            );
        }
    }
}
