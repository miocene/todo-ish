# Calendar date / day-type design QA (historical)

This records the August 2026 design review, not the current calendar layout or a current passing check. The original screenshots were local temporary artifacts and are not bundled with this repository. Names below identify them without machine-specific paths. Current functional coverage lives in [the Work browser tests](./tests/work.spec.js).

- Source visual truth: `CleanShot 2026-08-31 at 22.49.10@2x.png`, clarified by the user: every calendar date uses this horizontal icon/date/weekday layout, green represents activity intensity, and each date has one activity block.
- Browser-rendered implementation: `todo-ish-calendar-all-days.jpg`
- Source-and-implementation comparison: `todo-ish-calendar-all-days-comparison.png`
- Browser viewport: 672 × 863 CSS pixels at density 1
- Source dimensions: 542 × 786 pixels at `@2x` (nominal 271 × 393 CSS pixels)
- Implementation dimensions: 672 × 863 pixels
- Focused comparison: 632 × 190 pixels; the source date crop was normalized from `@2x` and placed above the equal-width calendar crop
- State: five dates visible, August 21 selected, menu closed. August 21 has activity level 1; the surrounding empty dates have activity level 0.

## Full-view comparison evidence

Every visible date now uses the same day-type icon square, bold date number, and compact weekday layout. The selected date keeps the existing selection background; disabled history dates preserve the same structure at reduced opacity. The Work card, backlog, and persistent navigation remain unchanged.

## Focused comparison evidence

The combined comparison shows the reference's icon / `21 FRI` composition above the completed calendar row. All five implementation dates repeat that structure. Each date has exactly one activity-colored icon square; the old standalone 10-pixel activity squares are gone.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: every date shares the same number and weekday hierarchy; truncation does not occur at the 672-pixel viewport.
- Spacing and layout rhythm: the horizontal composition fits five dates without overflow and remains centered inside each equal grid column.
- Colors and visual tokens: each icon square maps to `--color-activity-0` through `--color-activity-4`. Level 0 is neutral; completed dates progressively darken through the green activity scale.
- Image quality and asset fidelity: every date uses its saved day-type glyph from the existing `JMIcon` sprite. No replacement or approximate icon was added.
- Copy and content: full-date and completed-task descriptions remain in each control's accessible name; visible copy is limited to the number and weekday as specified.

## Interaction and accessibility verification

- All five visible dates expose one day-type icon and no legacy activity element.
- Clicking an unselected date navigates to that date; it then becomes the editable day-type picker.
- The previously selected date returns to a normal date-navigation button.
- The selected picker opens with Enter, closes with Escape, and exposes seven native radio choices.
- Disabled history dates remain disabled without changing their visual structure.
- Completed-task counts remain in accessible names, so activity is not communicated by color alone.
- In-app browser logs contain no warnings or errors.

## Comparison history

- Earlier fix: moved the day-type picker from the Work card header into the selected calendar date.
- Earlier P2 fix: made the selected date's icon square activity-colored and removed its duplicate small activity square.
- Latest user review: surrounding dates still used the older vertical number/weekday/small-square design.
- Fix applied: every date is now rendered through `JMCalendarDay`; unselected dates use its non-editable navigation mode, while the selected date uses its picker mode.
- Post-fix evidence: `todo-ish-calendar-all-days-comparison.png` shows the reference composition repeated across every visible date.

## Follow-up polish

No P3 visual follow-ups remain for this correction.

## Implementation checklist

- [x] Apply the horizontal day-type icon / date / weekday layout to every date.
- [x] Use one activity-colored icon square per date.
- [x] Preserve selected, disabled, and today states.
- [x] Preserve date navigation for unselected dates.
- [x] Preserve day-type editing for the selected date.
- [x] Verify layout, navigation, keyboard behavior, accessibility names, and browser logs.

final result: passed
