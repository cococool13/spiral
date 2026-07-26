//! The one error shape the UI ever sees.
//!
//! Every failure has to say what went wrong *and* what to do about it.
//! An error without a next step is a dead end, so `next_step` is not
//! optional.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlimError {
    pub title: String,
    pub detail: String,
    pub next_step: String,
}

impl SlimError {
    pub fn new(
        title: impl Into<String>,
        detail: impl Into<String>,
        next_step: impl Into<String>,
    ) -> Self {
        Self {
            title: title.into(),
            detail: detail.into(),
            next_step: next_step.into(),
        }
    }
}

impl std::fmt::Display for SlimError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {} {}", self.title, self.detail, self.next_step)
    }
}

impl std::error::Error for SlimError {}

pub type SlimResult<T> = Result<T, SlimError>;
