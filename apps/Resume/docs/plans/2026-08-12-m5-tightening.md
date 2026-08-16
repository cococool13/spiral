# Spiral Resume M5 — The Tightening Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** The free tier's wording pass. No model, no network, no waiting — and it never changes a fact.

**Architecture:** One pure Rust module of ordered rules over a single bullet. Every rule either removes a leading phrase, swaps a known weak opener for a strong one, or fixes tense against a closed verb list. Nothing generates prose, so nothing can invent. The proof is a test asserting that every number, and every capitalised word, present in the source is still present after tightening — this is the deterministic tier's version of the fact-freeze gate, and it is enforced the same way: by a test that fails if the guard is removed.

## Global Constraints

M1–M4 hold. Added:

- **Facts are frozen here too.** These rules touch the *front* of a sentence. No rule may alter a digit, a proper noun, or anything after the opening clause. The number-preservation test is the gate.
- **Nothing is silent.** The Check screen shows what tightening will do to each bullet, before the build. A user who disagrees turns it off; the toggle is one switch, not a per-bullet negotiation.
- **A flag is not a change.** "No number in this bullet" is advice shown next to the bullet. The app never inserts a number, because it does not know one.
- **Conservative beats clever.** A rule that fires on a phrase it did not fully understand is worse than no rule. Every list here is closed and short.

## File Structure

| File | Responsibility |
| --- | --- |
| `src-tauri/src/tighten.rs` | The rules, the notes, and the fact-preservation guarantee. |
| `src-tauri/src/build.rs` | Gains a `Tightening wording` stage before `Setting type`. |
| `src/screens/Check.tsx` | Shows each bullet's tightened form and its flags; one toggle. |

---

### Task 1: The rules

**Interfaces:**

```rust
pub struct Note { pub bullet_id: String, pub message: String }
pub struct Tightened { pub text: String, pub notes: Vec<String> }

pub fn tighten_bullet(text: &str, present_tense: bool) -> Tightened;
pub fn tighten_doc(doc: &ResumeDoc) -> ResumeDoc;
pub fn review(doc: &ResumeDoc) -> Vec<Note>;
```

Rules, in order:
1. **Pronouns.** A leading `I `, `I've `, `My ` is removed — resume bullets are not sentences about "I".
2. **Filler openers.** `Responsible for`, `Was responsible for`, `Duties included`, `Tasked with`, `Helped to`, `Worked on`, `Assisted with` — removed, and the next word is capitalised.
3. **Weak openers → strong verbs**, from a closed table: `Helped` → `Supported`, `Made` → `Built`, `Did` → `Delivered`, `Went to` → `Attended`, `Got` → `Secured`, `Used` → `Applied`.
4. **Tense.** A role still running takes the present tense; a finished one takes the past. Only verbs in the same closed table are conjugated — an unknown verb is left exactly as written.
5. **Whitespace.** Runs of spaces collapse; a trailing full stop is left alone, because mixing bullets with and without one is the user's own consistent choice to make.

Flags (never changes): no digit anywhere in the bullet; more than 32 words; still opens with a weak verb the table could not fix.

- [ ] Tests, in full, in the module.
- [ ] Commit.

---

### Task 2: The guarantee

- [ ] Test: for every bullet in a realistic resume, the multiset of digit-runs before and after tightening is identical.
- [ ] Test: a bullet made only of facts (`Raised $2.4M across 3 rounds in 2021`) is returned byte-identical.
- [ ] **Mutation proof**, in the sense `apps/clean` uses: name the test that fails when the guard is removed. Here, deleting the "leading clause only" restriction makes `preserves_every_number` fail.
- [ ] Commit.

---

### Task 3: In the build and on the screen

- [ ] `StoredDoc` gains `tighten: bool`, defaulting to **true**.
- [ ] `build` gains a `Tightening wording` stage at 25%, with the others renumbered; `Reading structure` 15 · `Tightening wording` 25 · `Setting type` 60 · `Rendering pages` 85 · `Preparing the file` 100.
- [ ] Check screen: under each bullet whose text would change, the tightened version in quiet type; flags beside it; one toggle at the top of the section.
- [ ] The milestone gate: `pnpm tauri dev` — import a real resume, see the suggestions, turn them off, see them go.
- [ ] Commit.

## Self-review

This completes the deterministic tier of decision 2 and the free half of decision 3. What it deliberately does **not** do is rewrite a sentence — that needs a model and belongs to M6. The stage name `Tightening wording` is chosen so that M6's model pass can occupy the same slot without the build screen changing its vocabulary.
