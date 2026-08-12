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
    library: Std,
    fonts: &'static Faces,
    main: Source,
}

/// The Typst standard library, built around one set of `sys.inputs`.
///
/// Building it costs about half of a whole compile — it constructs every module
/// in the language — and it depends on nothing but the inputs. Twelve thumbnails
/// are twelve compiles of *the same* document, so they share one of these
/// instead of building twelve identical copies.
#[derive(Clone)]
pub struct Std(std::sync::Arc<LazyHash<Library>>);

impl Std {
    pub fn with_inputs(inputs: Dict) -> Self {
        Std(std::sync::Arc::new(LazyHash::new(
            Library::builder().with_inputs(inputs).build(),
        )))
    }
}

/// The bundled faces and their book. Parsing eight Liberation faces plus the
/// typst-assets fallbacks and building the `FontBook` costs about 8 ms and the
/// result never varies, so it is done once for the process rather than once per
/// compile — the Style screen alone compiles twelve times.
struct Faces {
    fonts: Vec<Font>,
    book: LazyHash<FontBook>,
}

static FACES: std::sync::OnceLock<Faces> = std::sync::OnceLock::new();

fn faces() -> &'static Faces {
    FACES.get_or_init(|| {
        // The resume faces come first so a template asking for one gets it, and
        // typst-assets supplies the maths and monospace fallbacks behind them.
        let fonts: Vec<Font> = RESUME_FACES
            .iter()
            .map(|bytes| Bytes::new(*bytes))
            .chain(typst_assets::fonts().map(Bytes::new))
            .flat_map(Font::iter)
            .collect();
        let book = LazyHash::new(FontBook::from_fonts(&fonts));
        Faces { fonts, book }
    })
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
        Self::with_std(source, Std::with_inputs(inputs))
    }

    pub fn with_std(source: String, library: Std) -> Self {
        Self {
            library,
            fonts: faces(),
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
        &self.library.0
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.fonts.book
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
        self.fonts.fonts.get(index).cloned()
    }

    /// No clock. A resume must render byte-identically every time, and the only
    /// thing a date would feed is Typst's `datetime.today()`, which no template
    /// uses.
    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}

/// Compile a template to PDF bytes, or to the first Typst error as a sentence.
/// Production always has inputs to pass, so this convenience exists only for
/// tests that compile a bare snippet.
#[cfg(test)]
pub fn to_pdf(source: String) -> Result<Vec<u8>, String> {
    pdf_with_inputs(source, Dict::new())
}

/// Compile a template to one SVG string per page. Same source, same engine, so
/// a thumbnail cannot show something the PDF will not. Test-only, for the same
/// reason as `to_pdf`.
#[cfg(test)]
pub fn to_svg_pages(source: String) -> Result<Vec<String>, String> {
    svg_pages_with_inputs(source, Dict::new())
}

pub fn pdf_with_inputs(source: String, inputs: Dict) -> Result<Vec<u8>, String> {
    document_to_pdf(&compile(source, inputs)?)
}

pub fn svg_pages_with_inputs(source: String, inputs: Dict) -> Result<Vec<String>, String> {
    Ok(document_to_svg_pages(&compile(source, inputs)?))
}

/// Compile once and keep the document. The staged build needs the typesetting
/// and the exporting to be separate steps, because each one is a stage the user
/// is shown — and compiling twice to report two stages would be a lie about
/// where the time went.
pub fn compile(source: String, inputs: Dict) -> Result<PagedDocument, String> {
    compile_with(source, Std::with_inputs(inputs))
}

pub fn compile_with(source: String, library: Std) -> Result<PagedDocument, String> {
    let world = ResumeWorld::with_std(source, library);
    typst::compile(&world).output.map_err(first_error)
}

pub fn document_to_pdf(document: &PagedDocument) -> Result<Vec<u8>, String> {
    typst_pdf::pdf(document, &typst_pdf::PdfOptions::default()).map_err(first_error)
}

pub fn document_to_svg_pages(document: &PagedDocument) -> Vec<String> {
    let options = typst_svg::SvgOptions::default();
    document
        .pages()
        .iter()
        .map(|page| typst_svg::svg(page, &options))
        .collect()
}

/// Only the first page. A style card shows one page, and drawing the rest of a
/// three-page resume twelve times over is work nobody ever sees — SVG export
/// costs more than the compile that produced the document.
pub fn document_to_first_svg_page(document: &PagedDocument) -> Option<String> {
    document
        .pages()
        .first()
        .map(|page| typst_svg::svg(page, &typst_svg::SvgOptions::default()))
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

