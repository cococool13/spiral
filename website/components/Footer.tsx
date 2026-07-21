export default function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 py-16 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="block h-6 w-6 bg-red"
            style={{
              maskImage: "url(/branding/spiral-mark.svg)",
              WebkitMaskImage: "url(/branding/spiral-mark.svg)",
              maskSize: "contain",
              WebkitMaskSize: "contain",
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskPosition: "center",
            }}
          />
          <span className="font-mono text-xs uppercase tracking-widest text-gray">
            Free. Always.
          </span>
        </div>
        <nav className="flex gap-8 font-mono text-xs text-gray">
          <a
            href="https://github.com/cococool13/spiral-wallpaper"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-paper"
          >
            GitHub
          </a>
          <a
            href="mailto:spiralcoco@gmail.com"
            className="transition-colors hover:text-paper"
          >
            Contact
          </a>
          <a href="#other-work" className="transition-colors hover:text-paper">
            Other Work
          </a>
        </nav>
      </div>
    </footer>
  );
}
