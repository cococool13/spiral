//! How the offline engine is measured. Never runs in CI — it needs a model.
//!
//! Runs the real `rewrite_doc` — real prompt, real provider code, real fact
//! gate — against a `llama-server` already listening on `ENGINE_PORT`, so the
//! numbers describe what a user would actually get rather than what a mock
//! would say. Every engine decision in this app was made with it:
//!
//! | Change | 64-bullet resume, accepted by the gate |
//! | --- | --- |
//! | as first written | 0 of 64 — one request overflowed the context |
//! | batched at 20 | 4 of 64 — replies came back missing a closing brace |
//! | `json_schema` response format | **64 of 64** |
//!
//! To run it:
//!
//! ```text
//! llama-server --model <model.gguf> --port 52002 --host 127.0.0.1 \
//!     --ctx-size 8192 --n-predict 2048 --reasoning off &
//! ENGINE_PORT=52002 cargo test --release engine_bench -- --ignored --nocapture
//! ```
//!
//! `BENCH_ROLES=8` makes the long fixture 64 bullets instead of 32.
#[cfg(test)]
mod bench {
    use crate::provider::Provider;

    /// Bullets in the shapes real resumes use: filler openers, weak verbs,
    /// numbers that must survive, proper nouns that must survive, and one that
    /// is already tight (rule 5 says improve it slightly, not wreck it).
    const RESUME: &str = "\
Ada Lovelace
ada@example.com

EXPERIENCE
Analyst, Admiralty
Jan 2021 - Present
- Was responsible for managing a team of 6 engineers at Admiralty over 18 months
- Helped to check 400 tables of logarithms for the Nautical Almanac
- Worked on the first published algorithm for the Analytical Engine
- Duties included reducing report turnaround from 9 days to 2 days
- Responsible for a budget of $12,000 across 3 departments
- Cut latency by 40%

Intern, Difference Works
Jun 2020 - Dec 2020
- Assisted with the migration of 15 punch-card readers to a new format
- Was involved in training 25 operators on the Jacquard loom interface
";

    /// A dense two-page resume: 30 bullets across four roles. The context is
    /// the cliff to find — if the reply is truncated the JSON will not parse
    /// and *every* bullet is discarded, so the user gets nothing at all.
    fn long_resume() -> String {
        let mut out = String::from("Ada Lovelace\nada@example.com\n\nEXPERIENCE\n");
        let roles: usize = std::env::var("BENCH_ROLES").ok().and_then(|v| v.parse().ok()).unwrap_or(4);
        for role in 0..roles {
            out.push_str(&format!(
                "Analyst {role}, Admiralty {role}\nJan 2021 - Present\n"
            ));
            for bullet in 0..8 {
                out.push_str(&format!(
                    "- Was responsible for managing {} engineers on project {role}-{bullet}, reducing turnaround from {} days to {} days across {} departments\n",
                    bullet + 3, bullet + 9, bullet + 2, bullet + 1
                ));
            }
            out.push('\n');
        }
        out
    }

    fn port() -> u16 {
        std::env::var("ENGINE_PORT").unwrap().parse().unwrap()
    }

    #[tokio::test]
    #[ignore]
    async fn measure_long() {
        run(&long_resume()).await;
    }

    #[tokio::test]
    #[ignore]
    async fn measure() {
        run(RESUME).await;
    }

    async fn run(source: &str) {
        let doc = crate::parse_text::parse_text(source);
        let total: usize = doc.roles().map(|r| r.bullets.len()).sum();
        let provider = Provider::Local {
            base_url: format!("http://127.0.0.1:{}/v1", port()),
        };

        let started = std::time::Instant::now();
        let (out, outcome) = crate::rewrite::rewrite_doc(&doc, &provider, "", "local")
            .await
            .expect("the engine did not answer");
        let elapsed = started.elapsed();

        println!("--- bullets: {total}");
        println!("--- accepted by the gate: {}", outcome.rewritten);
        println!("--- rejected by the gate: {}", outcome.rejected);
        println!("--- seconds: {:.1}", elapsed.as_secs_f64());
        for note in &outcome.notes {
            println!("    REJECTED: {note}");
        }

        // What actually changed, so quality can be read rather than inferred.
        let before: Vec<String> = doc.roles().flat_map(|r| r.bullets.iter()).map(|b| b.text.clone()).collect();
        let after: Vec<String> = out.roles().flat_map(|r| r.bullets.iter()).map(|b| b.text.clone()).collect();
        let mut untouched = 0;
        for (b, a) in before.iter().zip(after.iter()) {
            if b == a {
                untouched += 1;
                println!("    unchanged: {b}");
            } else {
                println!("    {b}\n         -> {a}");
            }
        }
        println!("--- unchanged: {untouched}/{total}");

        // Filler that rule 3 exists to remove.
        const FILLER: [&str; 6] = [
            "Was responsible for",
            "Responsible for",
            "Helped to",
            "Worked on",
            "Duties included",
            "Was involved in",
        ];
        let left = after
            .iter()
            .filter(|t| FILLER.iter().any(|f| t.starts_with(f)))
            .count();
        println!("--- bullets still opening with filler: {left}");
    }
}
