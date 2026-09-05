# Follow-ups after the design work

These items were deferred during the September 2026 repository review. Keep them separate from the functional fixes and open one merge request per item when its prerequisites are settled.

| Item                                         | Prerequisite                                                                                                                     | Intended outcome                                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared card container                        | Final Today, Backlog, project, and list designs                                                                                  | Extract a small shared shell only where heading, actions, content, spacing, and color treatment match. Keep individual task rows in JMTaskCard.                          |
| Recurring chores                             | Decide fixed-calendar versus completion-relative scheduling, missed-occurrence behavior, editing rules, and history presentation | Store a structured schedule and individual occurrences; completion advances the schedule without erasing history. The current rule text is descriptive, not a scheduler. |
| Save and conflict presentation               | Final placement and copy for saving, offline, validation, authentication, and conflict states                                    | Polish the functional recovery controls without hiding unsaved changes or silently overwriting another browser's edits.                                                  |
| Empty list and catalog loading/error layouts | Final empty-state, list-creation, and retry designs                                                                              | Replace the functional states with the agreed layouts while preserving keyboard access and independent retries.                                                          |
| Task editor interaction variants             | Final decisions on Enter, multiline titles, deletion, and completion movement                                                    | Adjust the shared editing controller and its behavior tests; keep the existing interactions until then.                                                                  |

## Deliberately outside this pass

- Do not apply the pending color database migration until explicitly requested. Development mock colors remain supported.
- Consider individual-item API updates after measuring the remaining cost of batched, deduplicated resource saves.
- Keep current API field compatibility while centralizing completion handling; a breaking wire-format migration needs a separate rollout.

## Local review workflow

Implementation changes are separate local commits, each intended as one reviewable merge request. Do not push or publish them without an explicit request.
