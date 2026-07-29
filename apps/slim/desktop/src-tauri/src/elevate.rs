//! Running one command with administrator rights, through the operating
//! system's own dialog.
//!
//! Spiral Slim never collects a password on either platform. macOS gets
//! `do shell script … with administrator privileges`; Windows gets
//! `Start-Process -Verb RunAs`, which raises the UAC prompt. In both cases
//! the OS owns the credential and Spiral Slim only learns whether the command
//! ran.
//!
//! Every argument is quoted for the shell that will carry it — twice on
//! macOS, once for `/bin/sh` and once for the AppleScript literal around it;
//! once on Windows, for PowerShell. All three quoters are tested, because a
//! mistake in any of them is a command-injection bug in a privileged path.
//!
//! The script builders are deliberately pure functions of their arguments.
//! This is developed on macOS, where the Windows branch cannot even be
//! compiled, so the Windows *logic* is kept in code that macOS does compile
//! and test. What is left unverified is the handful of lines that hand the
//! finished string to PowerShell.

use std::path::Path;
use std::process::Command;

use crate::error::{SlimError, SlimResult};

/// What a privileged run produced. Both platforms return this rather than a
/// `std::process::Output`, because on Windows the elevated child is a
/// separate process whose output arrives via redirect files, not a pipe.
pub struct PrivilegedOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

/// Wrap a value in single quotes for `/bin/sh`, escaping embedded quotes.
pub fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

/// Wrap a value in double quotes for an AppleScript string literal.
pub fn applescript_quote(value: &str) -> String {
    let escaped = value.replace('\\', r"\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

/// Build the AppleScript that asks macOS to run `argv` as an administrator.
pub fn build_admin_script(argv: &[String], prompt: &str) -> String {
    let command = argv
        .iter()
        .map(|part| shell_quote(part))
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "do shell script {} with prompt {} with administrator privileges",
        applescript_quote(&command),
        applescript_quote(prompt),
    )
}

/// Wrap a value in single quotes for PowerShell, doubling embedded quotes.
///
/// PowerShell single-quoted strings are literal — no `$` expansion, no
/// backtick escapes, no subexpressions — so doubling `'` is the whole job.
/// A double-quoted string would be a different and much worse problem.
pub fn powershell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// Build the PowerShell that asks Windows to run `argv` elevated.
///
/// `-Verb RunAs` is what raises the UAC prompt; Windows owns that dialog and
/// the credential behind it. `-Wait` keeps this synchronous so the caller can
/// read the result, and the two redirect paths exist because an elevated
/// child is a separate process — its stdout cannot be piped back directly.
///
/// `$ErrorActionPreference = 'Stop'` matters: without it a failed
/// `Start-Process` writes to the error stream and PowerShell still exits 0,
/// so a refused UAC prompt would look like success.
pub fn build_elevation_command(
    argv: &[String],
    stdout_path: &str,
    stderr_path: &str,
) -> String {
    let (program, rest) = argv.split_first().map_or(("", &[][..]), |(f, r)| (f.as_str(), r));
    let arguments = rest
        .iter()
        .map(|part| powershell_quote(part))
        .collect::<Vec<_>>()
        .join(",");
    let argument_list = if arguments.is_empty() {
        String::new()
    } else {
        format!(" -ArgumentList {arguments}")
    };
    format!(
        "$ErrorActionPreference = 'Stop'; Start-Process -FilePath {}{} \
         -Verb RunAs -Wait -WindowStyle Hidden \
         -RedirectStandardOutput {} -RedirectStandardError {}",
        powershell_quote(program),
        argument_list,
        powershell_quote(stdout_path),
        powershell_quote(stderr_path),
    )
}

/// True when the privileged run failed because the person dismissed the
/// dialog. That is a decision, not a fault, and must not be reported as an
/// error.
///
/// Covers both systems: macOS reports "User cancelled" and AppleScript error
/// -128; Windows reports ERROR_CANCELLED (1223) and, from PowerShell,
/// "The operation was canceled by the user".
pub fn is_user_cancelled(stderr: &str) -> bool {
    stderr.contains("User cancelled")
        || stderr.contains("User canceled")
        || stderr.contains("-128")
        || stderr.contains("canceled by the user")
        || stderr.contains("cancelled by the user")
        || stderr.contains("1223")
}

/// The name of the OS dialog, for messages the person reads.
pub const AUTH_DIALOG: &str = if cfg!(target_os = "windows") {
    "Windows permission prompt"
} else {
    "macOS permission dialog"
};

#[cfg(target_os = "macos")]
pub fn run_privileged(argv: &[String], prompt: &str) -> SlimResult<PrivilegedOutput> {
    let script = build_admin_script(argv, prompt);
    let output = Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|error| {
            SlimError::new(
                "Could not ask macOS for permission",
                error.to_string(),
                "Reopen Spiral Slim. If it keeps failing, run the SlimBrave Neo \
                 script from Terminal with sudo instead.",
            )
        })?;
    Ok(PrivilegedOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

/// Windows: raise UAC, then read what the elevated child wrote.
///
/// The elevated process is not a child of this one, so its output comes back
/// through two files in a private temp directory rather than a pipe. The
/// directory is removed when `workspace` drops, whatever the outcome.
#[cfg(target_os = "windows")]
pub fn run_privileged(argv: &[String], _prompt: &str) -> SlimResult<PrivilegedOutput> {
    let workspace = tempfile::Builder::new()
        .prefix("spiral-slim-elevated")
        .tempdir()
        .map_err(|error| {
            SlimError::new(
                "Could not prepare the change",
                error.to_string(),
                "Check that your temporary folder is writable, then try again.",
            )
        })?;
    let out_path = workspace.path().join("stdout.txt");
    let err_path = workspace.path().join("stderr.txt");
    let command = build_elevation_command(
        argv,
        &out_path.to_string_lossy(),
        &err_path.to_string_lossy(),
    );

    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &command])
        .output()
        .map_err(|error| {
            SlimError::new(
                "Could not ask Windows for permission",
                error.to_string(),
                "Reopen Spiral Slim. If it keeps failing, run slimbrave-windows.py \
                 from an Administrator PowerShell instead.",
            )
        })?;

    // The child's own stderr matters more than PowerShell's, but a refused
    // UAC prompt only ever appears in PowerShell's, so both are kept.
    let mut stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    if let Ok(child_stderr) = std::fs::read_to_string(&err_path) {
        if !child_stderr.trim().is_empty() {
            stderr.push('\n');
            stderr.push_str(&child_stderr);
        }
    }
    Ok(PrivilegedOutput {
        success: output.status.success(),
        stdout: std::fs::read_to_string(&out_path).unwrap_or_default(),
        stderr,
    })
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn run_privileged(_argv: &[String], _prompt: &str) -> SlimResult<PrivilegedOutput> {
    Err(SlimError::new(
        "Not supported on this platform",
        "Spiral Slim applies Brave policies on macOS and Windows only.".to_string(),
        "Run the SlimBrave Neo script for your platform directly.",
    ))
}

/// Reject anything that is not a plain identifier before it reaches a
/// privileged command line. Channel ids come from detection, but this is the
/// last place to be sure.
pub fn is_safe_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Control ids are dotted (`vendor.ai`), so they are not plain identifiers.
/// They only ever reach the read-only engine, never a privileged command
/// line, but they are still validated before being put on any argv.
pub fn is_safe_control_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && !value.starts_with('.')
        && !value.ends_with('.')
        && !value.contains("..")
        && value
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.')
}

/// Absolute paths only, and no interior NUL. Paths are ones Spiral Slim
/// built, so this is a guard against a bug, not against the user.
pub fn is_safe_path(path: &Path) -> bool {
    path.is_absolute() && !path.to_string_lossy().contains('\0')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_quoting_neutralises_an_embedded_quote() {
        assert_eq!(shell_quote("plain"), "'plain'");
        assert_eq!(shell_quote("it's"), r"'it'\''s'");
    }

    #[test]
    fn shell_quoting_neutralises_command_substitution() {
        let quoted = shell_quote("$(rm -rf /)");
        assert_eq!(quoted, "'$(rm -rf /)'");
        // Nothing escapes the single quotes, so the shell cannot expand it.
        assert!(!quoted[1..quoted.len() - 1].contains('\''));
    }

    #[test]
    fn a_quote_break_attempt_stays_inside_one_argument() {
        // The classic escape: close the quote, run something, reopen.
        let quoted = shell_quote("'; touch /tmp/pwned; '");
        assert_eq!(quoted, r"''\''; touch /tmp/pwned; '\'''");
    }

    #[test]
    fn applescript_quoting_escapes_backslashes_and_quotes() {
        assert_eq!(applescript_quote(r#"a"b"#), r#""a\"b""#);
        assert_eq!(applescript_quote(r"a\b"), r#""a\\b""#);
    }

    #[test]
    fn applescript_quoting_escapes_the_backslash_before_the_quote() {
        // Escaping in the wrong order would turn \" into \\" and end the
        // literal early.
        assert_eq!(applescript_quote(r#"a\"b"#), r#""a\\\"b""#);
    }

    #[test]
    fn the_admin_script_quotes_every_argument() {
        let argv = vec![
            "/usr/bin/python3".to_string(),
            "/Apps/My Tools/slimbrave-mac.py".to_string(),
            "--apply-plan".to_string(),
            "/tmp/plan.json".to_string(),
        ];
        let script = build_admin_script(&argv, "Spiral Slim");
        assert!(script.contains("'/Apps/My Tools/slimbrave-mac.py'"));
        assert!(script.starts_with("do shell script \""));
        assert!(script.ends_with("with administrator privileges"));
    }

    #[test]
    fn a_hostile_path_cannot_break_out_of_the_script() {
        let argv = vec![
            "/usr/bin/python3".to_string(),
            r#"/tmp/a" & (do shell script "id") & ""#.to_string(),
        ];
        let script = build_admin_script(&argv, "Spiral Slim");
        // The inner double quotes are escaped, so the AppleScript literal
        // is never terminated early.
        assert!(script.contains(r#"\""#));
        assert_eq!(script.matches("do shell script").count(), 2);
        // ...and the second occurrence is inert text inside the literal.
        let body = script
            .strip_prefix("do shell script ")
            .expect("known prefix");
        assert!(body.starts_with('"'));
    }

    #[test]
    fn identifiers_are_limited_to_channel_shaped_values() {
        assert!(is_safe_identifier("stable"));
        assert!(is_safe_identifier("nightly-2"));
        assert!(!is_safe_identifier(""));
        assert!(!is_safe_identifier("stable;rm"));
        assert!(!is_safe_identifier("Stable"));
        assert!(!is_safe_identifier("../etc"));
        assert!(!is_safe_identifier(&"a".repeat(65)));
    }

    #[test]
    fn control_ids_may_be_dotted_but_not_traversal() {
        assert!(is_safe_control_id("vendor.ai"));
        assert!(is_safe_control_id("permissions.notifications.default"));
        assert!(is_safe_control_id("security.downloads.malicious"));
        assert!(!is_safe_control_id(""));
        assert!(!is_safe_control_id("../etc/passwd"));
        assert!(!is_safe_control_id("a..b"));
        assert!(!is_safe_control_id(".hidden"));
        assert!(!is_safe_control_id("trailing."));
        assert!(!is_safe_control_id("Vendor.AI"));
        assert!(!is_safe_control_id("vendor.ai;rm"));
    }

    #[test]
    fn relative_paths_are_rejected() {
        // "/tmp/plan.json" is not absolute on Windows — an absolute path
        // there needs a drive or a UNC prefix. The function was right; the
        // test was written on a Mac and only said so when Windows first
        // compiled it.
        let absolute = if cfg!(windows) {
            r"C:\Temp\plan.json"
        } else {
            "/tmp/plan.json"
        };
        assert!(is_safe_path(Path::new(absolute)));
        assert!(!is_safe_path(Path::new("plan.json")));
    }

    #[test]
    fn a_unix_style_path_is_not_absolute_on_windows() {
        // Pinning the reason for the branch above, so nobody "simplifies" it
        // back into a single hardcoded path.
        let unix_style = is_safe_path(Path::new("/tmp/plan.json"));
        assert_eq!(unix_style, !cfg!(windows));
    }

    #[test]
    fn a_dismissed_dialog_is_recognised() {
        assert!(is_user_cancelled("execution error: User cancelled. (-128)"));
        assert!(is_user_cancelled("User canceled."));
        assert!(!is_user_cancelled("sudo: a password is required"));
    }

    #[test]
    fn a_dismissed_uac_prompt_is_recognised() {
        // Both spellings Windows and PowerShell actually produce.
        assert!(is_user_cancelled(
            "The operation was canceled by the user."
        ));
        assert!(is_user_cancelled(
            "Start-Process : This command cannot be run ... (1223)"
        ));
        assert!(!is_user_cancelled("Access is denied."));
    }

    /* ------------------------------------------------------------ *
     * Windows elevation. Built and tested here because the Windows
     * branch of run_privileged cannot be compiled on macOS — keeping
     * the logic in pure functions is what makes it verifiable at all.
     * ------------------------------------------------------------ */

    #[test]
    fn powershell_quoting_doubles_an_embedded_quote() {
        assert_eq!(powershell_quote("plain"), "'plain'");
        assert_eq!(powershell_quote("it's"), "'it''s'");
    }

    #[test]
    fn powershell_single_quotes_do_not_expand_anything() {
        // A single-quoted PowerShell string is literal: no $var, no $(...),
        // no backtick escapes. This is the reason for choosing it.
        let quoted = powershell_quote("$(Remove-Item C:\\ -Recurse)");
        assert_eq!(quoted, "'$(Remove-Item C:\\ -Recurse)'");
        assert!(!quoted[1..quoted.len() - 1].contains('\''));
    }

    #[test]
    fn a_powershell_quote_break_attempt_stays_inside_one_argument() {
        let quoted = powershell_quote("'; Remove-Item C:\\ ; '");
        assert_eq!(quoted, "'''; Remove-Item C:\\ ; '''");
        // Every interior quote is doubled, so none of them terminates it.
        let body = &quoted[1..quoted.len() - 1];
        assert!(body.matches('\'').count() % 2 == 0);
    }

    #[test]
    fn the_elevation_command_quotes_the_program_and_every_argument() {
        let argv = vec![
            r"C:\Python\python.exe".to_string(),
            r"C:\Program Files\slim\slimbrave-windows.py".to_string(),
            "--apply-plan".to_string(),
            r"C:\Temp\plan.json".to_string(),
        ];
        let command = build_elevation_command(&argv, r"C:\Temp\o.txt", r"C:\Temp\e.txt");
        assert!(command.contains(r"-FilePath 'C:\Python\python.exe'"));
        assert!(command.contains(r"'C:\Program Files\slim\slimbrave-windows.py'"));
        assert!(command.contains("'--apply-plan'"));
        assert!(command.contains("-Verb RunAs"));
        assert!(command.contains("-Wait"));
    }

    #[test]
    fn the_elevation_command_stops_on_error() {
        // Without this, a refused UAC prompt leaves PowerShell exiting 0 and
        // the refusal is read as success.
        let argv = vec!["python.exe".to_string()];
        let command = build_elevation_command(&argv, "o", "e");
        assert!(command.starts_with("$ErrorActionPreference = 'Stop';"));
    }

    #[test]
    fn a_hostile_argument_cannot_break_out_of_the_elevation_command() {
        let argv = vec![
            "python.exe".to_string(),
            "'; Start-Process cmd -Verb RunAs; '".to_string(),
        ];
        let command = build_elevation_command(&argv, "o", "e");
        // The whole hostile string became one quoted argument, so its
        // `-Verb RunAs` is inert text inside the argument list rather than a
        // second elevation. Counting occurrences would be the wrong check:
        // the payload legitimately contains that substring.
        assert!(command
            .contains("-ArgumentList '''; Start-Process cmd -Verb RunAs; '''"));
        // Exactly one `-Verb RunAs` sits outside any quoted argument: the
        // real one, in the fixed tail this function always appends.
        let tail = command
            .split("-ArgumentList ")
            .nth(1)
            .and_then(|rest| rest.split("''' ").nth(1))
            .expect("the fixed tail follows the argument list");
        assert_eq!(tail.matches("-Verb RunAs").count(), 1);
        assert!(!tail.contains("Start-Process"));
    }

    #[test]
    fn an_argument_free_command_omits_the_argument_list() {
        // `-ArgumentList` with nothing after it is a PowerShell parse error.
        let argv = vec!["python.exe".to_string()];
        let command = build_elevation_command(&argv, "o", "e");
        assert!(!command.contains("-ArgumentList"));
    }

    #[test]
    fn an_empty_argv_does_not_panic() {
        let command = build_elevation_command(&[], "o", "e");
        assert!(command.contains("-FilePath ''"));
    }

    #[test]
    fn redirect_paths_are_quoted_like_everything_else() {
        let argv = vec!["python.exe".to_string()];
        let command = build_elevation_command(&argv, r"C:\Temp\a b\o.txt", r"C:\Temp\e.txt");
        assert!(command.contains(r"-RedirectStandardOutput 'C:\Temp\a b\o.txt'"));
        assert!(command.contains(r"-RedirectStandardError 'C:\Temp\e.txt'"));
    }
}
