# Read-only analysis is exempt from the user-content bar

ADR-0005 bars searching, suggesting, or removing user-created content. That bar is scoped to removal. The disk analyzer may traverse and display any readable location, including Documents, Desktop, Downloads and external volumes, because it only ever renders sizes and hands off to Finder.

The distinction being drawn is between *seeing* and *proposing*. A space map that cannot show the largest folder on the disk is not a space map, and every competing tool provides one. What makes it safe is not where it looks but that it produces no removal candidates: the analyzer has no path into the removal boundary, offers no delete control, and its results never become a selection.

Recording this because the opposite reading is the natural one. A future contributor comparing the analyzer against ADR-0005 would reasonably conclude the analyzer violates it, and either cripple the feature or quietly widen the removal bar to match. Neither is correct — the two rules coexist precisely because the analyzer cannot delete.
