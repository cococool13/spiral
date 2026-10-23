fn main() {
    if let Err(err) = spiral_resume_engine::run() {
        eprintln!("{err}");
        std::process::exit(1);
    }
}
