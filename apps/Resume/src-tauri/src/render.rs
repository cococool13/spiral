//! The one rendering engine: Typst, compiled in-process.
//!
//! The same template source produces the PDF the user downloads and the SVG
//! thumbnail they picked it from, so a preview cannot disagree with an export.
//! Fonts are bundled — nothing is read from the machine's font folder and
//! nothing is fetched — which is also why a PDF looks the same on a recruiter's
//! computer as it does here.

use typst::diag::{FileError, FileResult, SourceDiagnostic};
use typst::foundations::{Bytes, Datetime, Dict, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_layout::PagedDocument;

/// A world holding exactly one source file and the bundled fonts. A resume is
/// a single document with no imports, so there is nothing else to resolve.
pub struct ResumeWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main: Source,
}

/// The faces a resume is set in. Committed under `assets/fonts/`, compiled into
/// the binary, and metrically identical to Times New Roman and Arial — which is
/// what will let the DOCX exporter name those two and still match this PDF page
/// for page. See `assets/fonts/README.md`.
const RESUME_FACES: [&[u8]; 8] = [
    include_bytes!("../../assets/fonts/LiberationSerif-Regular.ttf"),
    include_bytes!("../../assets/fonts/LiberationSerif-Bold.ttf"),
    include_bytes!("../../assets/fonts/LiberationSerif-Italic.ttf"),
    include_bytes!("../../assets/fonts/LiberationSerif-BoldItalic.ttf"),
    include_bytes!("../../assets/fonts/LiberationSans-Regular.ttf"),
    include_bytes!("../../assets/fonts/LiberationSans-Bold.ttf"),
    include_bytes!("../../assets/fonts/LiberationSans-Italic.ttf"),
    include_bytes!("../../assets/fonts/LiberationSans-BoldItalic.ttf"),
];

impl ResumeWorld {
    pub fn new(source: String) -> Self {
        Self::with_inputs(source, Dict::new())
    }

    /// The resume reaches a template through `sys.inputs`, never through the
    /// source text. That is the whole reason there is no escaping code in this
    /// app: a name containing a quote, a backslash, or a `#` is data here, and
    /// data cannot become syntax.
    pub fn with_inputs(source: String, inputs: Dict) -> Self {
        // The resume faces come first so a template asking for one gets it, and
        // typst-assets supplies the maths and monospace fallbacks behind them.
        let fonts: Vec<Font> = RESUME_FACES
            .iter()
            .map(|bytes| Bytes::new(*bytes))
            .chain(typst_assets::fonts().map(Bytes::new))
            .flat_map(Font::iter)
            .collect();
        let book = FontBook::from_fonts(&fonts);
        Self {
            library: LazyHash::new(Library::builder().with_inputs(inputs).build()),
            book: LazyHash::new(book),
            fonts,
            main: Source::new(main_id(), source),
        }
    }
}

/// The single file every resume compiles from. Interned once by Typst, so the
/// id is stable across renders and the incremental cache stays warm.
fn main_id() -> FileId {
    RootedPath::new(
        VirtualRoot::Project,
        VirtualPath::new("resume.typ").expect("resume.typ is a valid virtual path"),
    )
    .intern()
}

impl World for ResumeWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main.id()
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main.id() {
            Ok(self.main.clone())
        } else {
            Err(FileError::NotFound(id.vpath().get_without_slash().into()))
        }
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        Err(FileError::NotFound(id.vpath().get_without_slash().into()))
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    /// No clock. A resume must render byte-identically every time, and the only
    /// thing a date would feed is Typst's `datetime.today()`, which no template
    /// uses.
    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}

/// Compile a template to PDF bytes, or to the first Typst error as a sentence.
pub fn to_pdf(source: String) -> Result<Vec<u8>, String> {
    pdf_with_inputs(source, Dict::new())
}

/// Compile a template to one SVG string per page. Same source, same engine, so
/// a thumbnail cannot show something the PDF will not.
pub fn to_svg_pages(source: String) -> Result<Vec<String>, String> {
    svg_pages_with_inputs(source, Dict::new())
}

pub fn pdf_with_inputs(source: String, inputs: Dict) -> Result<Vec<u8>, String> {
    let document = compile(source, inputs)?;
    typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default()).map_err(first_error)
}

pub fn svg_pages_with_inputs(source: String, inputs: Dict) -> Result<Vec<String>, String> {
    let document = compile(source, inputs)?;
    let options = typst_svg::SvgOptions::default();
    Ok(document
        .pages()
        .iter()
        .map(|page| typst_svg::svg(page, &options))
        .collect())
}

fn compile(source: String, inputs: Dict) -> Result<PagedDocument, String> {
    let world = ResumeWorld::with_inputs(source, inputs);
    typst::compile(&world).output.map_err(first_error)
}

/// Typst reports every problem at once; the user needs the first one, phrased
/// as a sentence rather than a diagnostic dump.
fn first_error(errors: impl IntoIterator<Item = SourceDiagnostic>) -> String {
    match errors.into_iter().next() {
        Some(diagnostic) => format!("The template failed to typeset: {}.", diagnostic.message),
        None => "The template failed to typeset, with no reason given.".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HELLO: &str = "#set page(width: 200pt, height: 100pt)\nAda Lovelace";

    #[test]
    fn compiles_a_source_to_a_pdf() {
        let pdf = to_pdf(HELLO.to_string()).unwrap();
        assert!(pdf.starts_with(b"%PDF-"), "not a PDF");
        assert!(pdf.len() > 500, "suspiciously small PDF: {}", pdf.len());
    }

    #[test]
    fn compiles_the_same_source_to_one_svg_per_page() {
        let pages = to_svg_pages(HELLO.to_string()).unwrap();
        assert_eq!(pages.len(), 1);
        assert!(pages[0].starts_with("<svg"), "not an SVG");
    }

    #[test]
    fn a_broken_template_reads_as_a_sentence() {
        let err = to_pdf("#panic(\"nope\")".to_string()).unwrap_err();
        assert!(err.starts_with("The template failed to typeset"), "got {err}");
    }

    /// Typst only *warns* about an unknown family and carries on with a
    /// fallback, so compiling successfully proves nothing. Ask the font book.
    #[test]
    fn the_resume_faces_are_available_to_templates() {
        let world = ResumeWorld::new(String::new());
        for family in ["liberation serif", "liberation sans"] {
            assert!(
                world.book().contains_family(family),
                "{family} is not loaded; templates would silently fall back"
            );
        }
    }

    #[test]
    fn each_resume_face_has_all_four_styles() {
        let world = ResumeWorld::new(String::new());
        for family in ["liberation serif", "liberation sans"] {
            let count = world.book().select_family(family).count();
            assert_eq!(count, 4, "{family} has {count} styles, expected regular, bold, italic, bold-italic");
        }
    }

    #[test]
    fn the_same_source_renders_identically_twice() {
        assert_eq!(to_svg_pages(HELLO.into()).unwrap(), to_svg_pages(HELLO.into()).unwrap());
    }
}

