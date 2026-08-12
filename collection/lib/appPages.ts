/**
 * The copy for each app's own page.
 *
 * Every number here is measured or counted from the app it describes, not
 * estimated: Wallpaper's binary size and idle RAM come from its README, Slim's
 * preset and policy counts are counted out of `apps/slim/Presets`, and Clean's
 * vocabulary is the one its own `CONTEXT.md` defines. A page about tools that
 * promise not to invent things cannot invent its own figures.
 *
 * Four apps in `apps.ts` have no page here — Dashboard, Weather, Transcribe and
 * Chat have no code yet, and a page for them would be a description of an
 * intention. They stay cards until there is something true to write.
 */

export interface Fact {
  label: string;
  value: string;
}

export interface AppPage {
  slug: string;
  name: string;
  title: string;
  description: string;
  eyebrow: string;
  /** One line per rendered line, broken where the thought breaks. */
  headline: string[];
  sub: string;
  cta: { label: string; href: string };
  secondary: { label: string; href: string };
  proofLine: string;
  /** The large statement further down the page. Two lines minimum. */
  tagline: string[];
  benefitsHeading: string;
  benefits: { title: string; body: string }[];
  stepsHeading: string;
  steps: { n: string; title: string; body: string }[];
  factsHeading?: string;
  factsNote?: string;
  facts?: Fact[];
  faq: { q: string; a: string }[];
  closing: { headline: string[]; body: string };
}

const REPO = "https://github.com/cococool13/spiral";
const RELEASE = `${REPO}/releases`;

export const appPages: AppPage[] = [
  {
    slug: "resume",
    name: "Spiral Resume",
    title: "Spiral Resume — your resume, set properly",
    description:
      "A free desktop resume builder. Twelve typeset layouts, PDF and Word from one source, and a model that is never allowed to change a fact.",
    eyebrow: "Spiral Resume",
    headline: ["Your resume,", "set properly."],
    sub: "Twelve typeset layouts. Your words, your facts, your file — PDF or Word, on your computer in about a second.",
    cta: { label: "Watch for the first release", href: RELEASE },
    secondary: { label: "Read the source", href: `${REPO}/tree/main/apps/Resume` },
    proofLine: "Free. No account, no upload, no telemetry.",
    tagline: [
      "A resume tool that rewrites",
      "your job title is not helping.",
      "This one is not allowed to.",
    ],
    benefitsHeading: "Built to be trusted with the truth.",
    benefits: [
      {
        title: "It never invents a fact",
        body: "Every number, employer, date and acronym in a rewrite is checked against what you wrote. One that moved is thrown away and your own wording is kept. The app tells you when that happens.",
      },
      {
        title: "Twelve layouts, all of them yours",
        body: "Every card on the style screen is your resume, typeset. Not a sample with someone else's name on it, and not a picture of a template.",
      },
      {
        title: "PDF and Word from one source",
        body: "Both come out of the same document in metrically matched faces, so the Word file breaks its lines where the PDF breaks them.",
      },
      {
        title: "Three engines, one promise",
        body: "Free rules, your own API key, or a 2.7 GB model that runs on your machine and never opens a connection. The free one does the job.",
      },
    ],
    stepsHeading: "Three screens, then a file.",
    steps: [
      {
        n: "01",
        title: "Bring what you have",
        body: "Paste it, or drop a PDF or Word file onto the window. Nothing is uploaded; the file is read on your computer.",
      },
      {
        n: "02",
        title: "Check what we read",
        body: "Every field it found is editable before anything is built, because a parser that guessed wrong should cost you a keystroke, not an interview.",
      },
      {
        n: "03",
        title: "Pick a style and save it",
        body: "Twelve layouts, one accent colour, PDF or Word. About a second from picking to a file on your disk.",
      },
    ],
    factsHeading: "Measured on the app itself.",
    factsNote: "Timings from an Apple silicon laptop, taken while building it.",
    facts: [
      { label: "Layouts", value: "12" },
      { label: "Style screen", value: "About 2 ms" },
      { label: "Offline model", value: "2.7 GB, optional" },
      { label: "Accounts required", value: "None" },
    ],
    faq: [
      {
        q: "Is the free version limited?",
        a: "No. The free pass lays your resume out and tightens the wording by rule: it removes filler like “responsible for”, leads with a past-tense verb, and flags bullets with no number in them. Adding a key changes who rewrites the phrasing, not what you are allowed to make or export.",
      },
      {
        q: "What does “never changes a fact” actually mean?",
        a: "Before a rewritten bullet is allowed into your document, it is compared with the original. Every run of digits must still be there, in the same order, and every proper noun must still be there. A rewrite that moved one is discarded and your sentence is kept. It is a filter, not advice.",
      },
      {
        q: "Does anything I type leave my computer?",
        a: "Only if you add your own API key, and then only the bullet text, never your name, employer, dates or school. With the free pass or the offline model nothing leaves at all. There is no account, no analytics and no telemetry.",
      },
      {
        q: "How big is the offline model, and how slow is it?",
        a: "2.7 GB, downloaded once, only if you ask for it. On an Apple silicon laptop it rewrote a 64 bullet resume in about 44 seconds. An API key is faster; the rule based pass is instant.",
      },
      {
        q: "Will the Word file look like the PDF?",
        a: "The text, the order and the page count match, because both are built from the same document in metrically identical faces. Word’s spacing model is its own, so it is not pixel for pixel, and the app does not claim otherwise.",
      },
      {
        q: "Can an applicant tracking system read it?",
        a: "Yes. Every layout is real text in a normal single flow, and one of them, Sheet, is deliberately the plainest thing a parser can be handed.",
      },
      {
        q: "Why is there no account?",
        a: "Because there is nothing to sync. Your resume is one file in your own application data folder, and Settings shows you the exact path and will delete it.",
      },
      {
        q: "My old resume is two columns. Will the import work?",
        a: "Often, but a two column PDF can come out interleaved, and the app says so before you import one. That is what the Check screen is for: everything it read is editable before a single page is set.",
      },
      {
        q: "Is there a Windows build?",
        a: "Not yet. The code is cross platform and the macOS build is signed; the Windows installer has not been cut.",
      },
    ],
    closing: {
      headline: ["It is not out yet.", "It will be free when it is."],
      body: "Spiral Resume is finished enough to build your resume and not finished enough to hand you an installer. The source is public today.",
    },
  },
  {
    slug: "wallpaper",
    name: "Spiral Wallpaper",
    title: "Spiral Wallpaper — click a wallpaper, it applies",
    description:
      "A 4.6 MB desktop wallpaper app for macOS and Windows. No account, no telemetry, and nothing running in the background once you close it.",
    eyebrow: "Spiral Wallpaper",
    headline: ["One click.", "New wallpaper."],
    sub: "Search, click, done. A 4.6 MB app that closes when you close it and leaves nothing running behind.",
    cta: { label: "Download for macOS", href: RELEASE },
    secondary: { label: "All downloads", href: RELEASE },
    proofLine: "Free. Version 1.0.3, signed and notarised on macOS.",
    tagline: [
      "Most wallpaper apps want an account,",
      "a subscription and a background process.",
      "This one wants a click.",
    ],
    benefitsHeading: "Small on purpose.",
    benefits: [
      {
        title: "It quits when you close it",
        body: "No tray icon, no helper, no login item. Closing the window ends the process, which is the whole reason it can be trusted to sit on your machine.",
      },
      {
        title: "Nothing is sent anywhere",
        body: "No account, no analytics, no telemetry. It makes no network request at all until you search, and every request it does make happens in the Rust core rather than the webview.",
      },
      {
        title: "It stays out of your disk",
        body: "Thumbnails are cached locally with a 200 MB ceiling you can see and change in Settings. Nothing else is kept.",
      },
      {
        title: "It checks what it downloads",
        body: "A file is validated as an image before it is written or applied, so a bad response cannot become your desktop.",
      },
    ],
    stepsHeading: "Three clicks, no setup.",
    steps: [
      {
        n: "01",
        title: "Search",
        body: "Wallhaven, safe-for-work only, no API key and no sign-in. The source sits behind an interface so more can be added without rewriting the app.",
      },
      {
        n: "02",
        title: "Click the one you want",
        body: "It downloads, it is checked, and it becomes your wallpaper. The app says what it is doing while it does it.",
      },
      {
        n: "03",
        title: "Close the window",
        body: "That is the quit. Nothing survives it.",
      },
    ],
    factsHeading: "Measured, not estimated.",
    factsNote:
      "Taken on Apple silicon, and written in the app's README rather than on a slide.",
    facts: [
      { label: "Binary", value: "4.6 MB" },
      { label: "Idle memory", value: "95 MB" },
      { label: "Window on screen", value: "Under a second" },
      { label: "Thumbnail cache ceiling", value: "200 MB" },
    ],
    faq: [
      {
        q: "Do I need an account?",
        a: "No, and there is nowhere to make one. Wallhaven's safe-for-work search needs no key, so the app ships without one.",
      },
      {
        q: "Does it run in the background?",
        a: "No. There is no tray icon and no helper process. Closing the window quits the app, and that is a design decision rather than a missing feature.",
      },
      {
        q: "Is it really free?",
        a: "Yes, and there is no paid tier to upgrade to. The source is public.",
      },
      {
        q: "Windows?",
        a: "Yes, and it works. The Windows build is not code-signed, so SmartScreen will warn you the first time; the README walks through what you will see.",
      },
      {
        q: "Can I add my own wallpaper source?",
        a: "The code is arranged for it — sources sit behind a `WallpaperSource` boundary so a new one does not mean rewriting the interface. Shipping one is a product decision, not a technical one.",
      },
      {
        q: "Does it support animated or live wallpapers?",
        a: "No. Static images only, deliberately: a live wallpaper is a process that never stops, and this app's whole promise is that it stops.",
      },
    ],
    closing: {
      headline: ["Small, free,", "and out of the way."],
      body: "Free, signed on macOS, and 4.6 MB. Version 1.0.3 is out now.",
    },
  },

  {
    slug: "slim",
    name: "Spiral Slim",
    title: "Spiral Slim — debloat your browser, see every change first",
    description:
      "Sets enterprise privacy policies on Brave, Chrome, Edge and Firefox. Nineteen presets, every change shown before it is written, and one command to undo it.",
    eyebrow: "Spiral Slim",
    headline: ["Debloat your", "browser."],
    sub: "Nineteen presets across four browsers, applied through the policy system the browsers already respect. No extension, no patch, nothing injected.",
    cta: { label: "Download for macOS", href: RELEASE },
    secondary: { label: "Read the source", href: `${REPO}/tree/main/apps/slim` },
    proofLine: "Free. Python standard library only, no dependencies.",
    tagline: [
      "It changes settings your browser",
      "already lets an employer change.",
      "It just shows you them first.",
    ],
    benefitsHeading: "Nothing hidden, nothing patched.",
    benefits: [
      {
        title: "It shows the diff before it writes",
        body: "Every policy it is about to set is printed first, by name. You approve a list you have actually read, rather than a checkbox that says harden.",
      },
      {
        title: "It uses the browser's own mechanism",
        body: "These are enterprise managed policies — the same system an IT department uses. No extension to install, no binary to patch, nothing injected into a running browser.",
      },
      {
        title: "It undoes itself",
        body: "The policies it wrote can be removed again. A tool that changes your browser and cannot change it back is not a tool you should run.",
      },
      {
        title: "It has no dependencies",
        body: "Python standard library only. Nothing is pulled from a package index at install time, which is one fewer place for something to go wrong.",
      },
    ],
    stepsHeading: "Pick a preset, read it, apply it.",
    steps: [
      {
        n: "01",
        title: "Choose a browser and a preset",
        body: "Brave by default; Chrome, Edge and Firefox with a flag. Presets run from Developer, which touches least, to Maximum Privacy, which touches most.",
      },
      {
        n: "02",
        title: "Read what it will change",
        body: "Every policy is named before anything is written, so you can decline the ones you disagree with.",
      },
      {
        n: "03",
        title: "Apply, and restart the browser",
        body: "The policies take effect on the next launch, and the browser reports them itself on its own policy page.",
      },
    ],
    factsHeading: "What is actually in the presets.",
    factsNote: "Counted out of the preset files in the repository.",
    facts: [
      { label: "Browsers", value: "Brave, Chrome, Edge, Firefox" },
      { label: "Presets", value: "19" },
      { label: "Policies in Brave Maximum Privacy", value: "54" },
      { label: "Runtime dependencies", value: "None" },
    ],
    faq: [
      {
        q: "Is this an extension?",
        a: "No. It writes managed policy files, the mechanism browsers already provide for organisations. Nothing is added to the browser and nothing runs alongside it.",
      },
      {
        q: "Can I undo it?",
        a: "Yes. The policies it wrote can be removed again, and the browser returns to its own defaults on the next launch.",
      },
      {
        q: "Will it break sign-in or sync?",
        a: "The stricter presets deliberately turn off features some people rely on, which is why every policy is printed before it is applied. Balanced Privacy is the one to start with.",
      },
      {
        q: "Which browsers?",
        a: "Brave is the default and has the most coverage at 54 policies in its strictest preset. Chrome, Edge and Firefox are supported with a flag.",
      },
      {
        q: "Does it work on Linux and Windows?",
        a: "Yes, the scripts run on Linux, macOS and Windows. The only signed binary is the macOS wizard; everywhere else it runs from source, and the project's SECURITY.md draws that line deliberately.",
      },
      {
        q: "Why Python with no dependencies?",
        a: "Because a tool that hardens your browser should not ask you to trust a chain of packages to do it. Standard library only means the code you read is the code that runs.",
      },
    ],
    closing: {
      headline: ["Read the changes.", "Then make them."],
      body: "Free, and the macOS wizard is signed and notarised. Everywhere else it runs from source.",
    },
  },

  {
    slug: "clean",
    name: "Spiral Clean",
    title: "Spiral Clean — it asks before it deletes, and mostly it does not delete",
    description:
      "A macOS maintenance app built around one rule: it may only permanently remove things from a fixed catalogue of regenerable files. Everything else goes to the Trash.",
    eyebrow: "Spiral Clean",
    headline: ["A cleaner", "you can trust."],
    sub: "It removes caches and uninstalls apps on macOS. What it may permanently delete is a fixed list decided before the release, not a judgement it makes about your files.",
    cta: { label: "Watch for the first release", href: RELEASE },
    secondary: { label: "Read the source", href: `${REPO}/tree/main/apps/clean` },
    proofLine: "Free. macOS only, and not released yet.",
    tagline: [
      "Every other cleaner asks you",
      "to trust its judgement.",
      "This one shows you its list.",
    ],
    benefitsHeading: "The safety is the product.",
    benefits: [
      {
        title: "A fixed catalogue, not a guess",
        body: "It may permanently delete only what is in its safe-category catalogue, a list shipped with the release. Nothing is ever judged safe by looking at the file itself.",
      },
      {
        title: "The Trash, not oblivion",
        body: "Anything outside that catalogue is moved to the Trash rather than deleted, so a mistake costs you a restore rather than a file.",
      },
      {
        title: "It says how it knows",
        body: "When uninstalling, a leftover is either a verified association — an exact bundle identifier, container or launch item — or a likely one, matched by name. The two never look the same on screen.",
      },
      {
        title: "It hands off what is not its job",
        body: "A Homebrew cask, a system extension, a login item: it names the right owner to act through instead of reaching in itself.",
      },
    ],
    stepsHeading: "Nothing happens without a review.",
    steps: [
      {
        n: "01",
        title: "It asks for access first",
        body: "Full Disk Access is requested up front and explained, because a maintenance app that cannot see the disk will quietly under-report rather than fail.",
      },
      {
        n: "02",
        title: "You read the list",
        body: "Every selected item, its size, and for an uninstall the evidence that ties it to the app, on one screen before anything is removed.",
      },
      {
        n: "03",
        title: "It reports what actually happened",
        body: "The estimate before a run and the measured change in free space afterwards are two different numbers, and it shows you both.",
      },
    ],
    factsHeading: "Where it has got to.",
    factsNote:
      "Milestones one to four are built and tested. The rest is honestly still a stub.",
    facts: [
      { label: "Platform", value: "macOS only" },
      { label: "Built", value: "Shell, access gate, safety core, Clean, Uninstall" },
      { label: "Still stubs", value: "Optimize and Storage" },
      { label: "Released", value: "Not yet" },
    ],
    faq: [
      {
        q: "Can it delete something I wanted?",
        a: "Permanent deletion is limited to the safe-category catalogue, which contains only clearly regenerable files. Everything else goes to the Trash, so it is recoverable.",
      },
      {
        q: "What stops it touching my documents?",
        a: "User-created content is never searched for, suggested or removed, even during an uninstall and even when the name matches the app exactly. That is a rule at the removal boundary, so it binds every screen rather than one.",
      },
      {
        q: "Can I protect specific things?",
        a: "Yes. The exclusion list is a set of paths and applications it may never remove, and it is enforced at the same boundary as everything else.",
      },
      {
        q: "Why does it want Full Disk Access?",
        a: "Because without it macOS hides most of what a cleaner is for, and an app that silently reports less than the truth is worse than one that asks.",
      },
      {
        q: "Does it promise to make my Mac faster?",
        a: "No. Optimize runs a named set of maintenance actions and reports what each one did. Speed is not a claim it makes.",
      },
      {
        q: "When can I have it?",
        a: "There is no date. The removal core and its tests are done; Optimize and Storage are not. It ships when they are.",
      },
    ],
    closing: {
      headline: ["Not finished.", "The risky half is."],
      body: "The removal core, its safety rules and its tests are built. The source is public while the rest catches up.",
    },
  },
];

/** Throws rather than returning undefined: these are read at build time during
 *  the static export, so a slug with no content stops the build instead of
 *  shipping a page with nothing on it. */
export function appPage(slug: string): AppPage {
  const page = appPages.find((entry) => entry.slug === slug);
  if (!page) throw new Error(`No page content for "${slug}".`);
  return page;
}
