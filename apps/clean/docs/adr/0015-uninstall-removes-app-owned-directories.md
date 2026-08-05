# Uninstall removes app-owned directories

Date: 2026-08-04 · Status: accepted (M4)

Spiral Clean removes **directories**, not only files, when uninstalling an application. The directories it may remove are exactly those the application itself owns:

- the application bundle, `<Name>.app`, under `/Applications` or `~/Applications`;
- `~/Library/Containers/<bundle id>`;
- `~/Library/Group Containers/group.<bundle id>`;
- `~/Library/Saved Application State/<bundle id>.savedState`;
- any other entry `associate.rs` returns from its fixed location list that happens to be a directory rather than a file — `~/Library/Application Support/<bundle id>`, for instance.

`remove::delete_permanent` already walks a directory bottom-up and removes each entry individually, and `trash::delete` already accepts one. Nothing new was built to make this work. What this ADR records is that it is **intended**, because three documents previously said the opposite.

## Why this is recorded now rather than assumed

M3 wrote down, in `m3-clean-screen-spec.md`, that directory pruning "gets its own design and its own review gate rather than arriving as a side effect". That was the right rule and it still holds — for the Clean screen, which is what it was written about. `scan::walk_files` yields `is_file()` entries only, so `catalog_candidates_for` can build nothing else, and a Clean run still leaves the empty folder skeleton behind.

M4 then shipped `associate::associate`, which returns `read_dir` entries — files *and* directories — and `uninstall_execute` passed them straight to `remove::execute`. Directory removal arrived. It was correct, it was bounded, and nothing said so. Three documents went on claiming only files are removed, which is the failure mode ADR-0012 exists to name in the other direction: a written guarantee that the code does not actually give.

So this is the design and this is the review gate, arriving after the capability rather than before it. That is worth stating plainly rather than backdating.

## Why the app's own containers qualify

Removing an application's container **is** what uninstalling means. `~/Library/Containers/com.example.foo` is not a folder that contains one file worth deleting and several worth keeping — it is the sandbox macOS created for that one application, it holds nothing belonging to anything else, and leaving it behind leaves the app half-installed. The same is true of `group.<id>`, of `<id>.savedState`, and of the `.app` bundle: each is a single-owner directory, and its owner is the thing being removed.

This is the opposite of the Clean screen's case, which is why the two answers differ. `~/Library/Caches` is shared by every application on the machine; an emptied subdirectory there may be empty because Spiral Clean removed its contents, or because the user's exclusion list protected them, or because a removal failed — and the three are indistinguishable from the directory alone. That ambiguity is the whole reason Clean-screen pruning needs its own rule. An app's own container has no such ambiguity: it is named after the app, it belongs to the app, and the app is going away.

## Which guards bound it

Nothing about directory removal is exempt from the bars that were already there, and none of them were widened to allow it:

1. **The user-content bar.** `~/Documents`, `~/Desktop`, `~/Downloads`, `~/Movies`, `~/Music`, `~/Pictures`, `~/Library/Mobile Documents`, `/Volumes`, every catalog root, and every *ancestor* of any of those, are denied under every justification (ADR-0005). A directory is denied there exactly as a file is.
2. **The container-depth rule.** An `AppBundle` candidate must sit at least two levels below `~/Library`. `~/Library/Containers` itself — which holds every application's sandbox — can never be a candidate; only `~/Library/Containers/<id>` can.
3. **The scope bar.** `is_within_app_bundle_scope` requires the candidate to be under `/Applications`, `~/Applications` or `~/Library` **both as written and as resolved**, and refuses any of those roots that has been relocated.
4. **The bundle-id bar.** `Evidence::Verified` reaches `Permanent` only when the path itself proves the tie — its final component carries the bundle id at a component boundary (`verified_name_matches`), or it is a real, non-symlinked `.app` directory whose own `Info.plist` declares that identifier (`bundle_declares_id`). `Evidence::Likely` goes to the Trash and is recoverable.
5. **The Apple bar.** Any `com.apple.*` bundle id is refused outright, at both evidence levels and regardless of location.
6. **The exclusion list.** Loaded fresh immediately before every removal, and — through `covers`'s ancestor clause — a directory candidate is skipped when the user has excluded anything *inside* it, not merely the directory itself.
7. **Symlinks are unlinked, never followed.** `delete_permanent` uses `symlink_metadata` and `follow_links(false)` plus `follow_root_links(false)`, so a link planted inside a container has the link removed and its target left alone.

## The consequence that has to be reported

`Outcome::PartiallyRemoved` is now **reachable**. `remove_dir_all` is not atomic; a directory with one unreadable child has some of its contents destroyed and the rest left behind, and reporting that as `Failed` — headed "could not be removed" — would tell the user nothing happened when something did. The bucket has existed since M2 for exactly this day. Both `run_clean` and `run_uninstall` keep it separate from `failed`, and the Uninstall screen renders it under its own heading.

## What was considered instead

- **Leaving the documents alone and removing the behaviour.** Rejected by Cohen: an uninstall that leaves `~/Library/Containers/com.example.foo` and the `.app` itself on disk is not an uninstall, and the guards that bound the removal were already built and mutation-proved.
- **A separate, weaker path for directories** — a flag on `Candidate`, or a `commands.rs`-side exemption for the bundle. Rejected: a mechanism by which the command layer can mark a path as trusted is exactly what ADR-0011 exists to prevent. The bundle goes through the same justification, the same evidence field and the same boundary check as every other item; what makes it removable is what `disposition_for` reads out of its own `Info.plist`, not anything the caller says.
- **Extending it to the Clean screen at the same time.** Rejected: the ambiguity described above is real, and it needs the rule M3 already specified. This ADR deliberately does not authorise it.

## What this does not authorise

Pruning emptied catalog directories on the Clean screen. Removing a directory that is not named after, or declared by, the application being uninstalled. Removing anything under `/System/Applications`, which is never scanned. Recursive removal from a `Catalog` justification, which still only ever sees `is_file()` paths.
