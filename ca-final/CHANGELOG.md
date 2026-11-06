# CA Final Rank Desk: changelog

## Phase 1: bug fixes, stability and data integrity (data version 2)

Restore point for this upgrade: `archive/app-v1-pre-phase1.html` (and git history).

### Security
- Squad board entries from other people are cleaned before display: only expected fields, as plain
  numbers and dates. Previously a squad member could inject code that ran for everyone viewing Squad.
- Shared exam dates are checked before use.

### Data integrity and sync
- Saved data now carries a version and upgrades step by step. v1 → v2 adds revision history and drops
  malformed records. A restore point is saved automatically before upgrading.
- Chapters have permanent IDs (identical to the old keys, so nothing moved). Tough topics now link to a
  chapter by ID instead of list position, so future syllabus edits can't misattach progress.
- Cloud sync uses a three-way merge (last synced copy, this device, other device). Changes made on two
  devices, or offline, are combined instead of one overwriting the other. On a true clash for the same
  value, the newer device wins.
- Failed cloud saves are kept and retried (5 s, 15 s, 60 s, 3 min, and when the device comes back online).
- Deleting a tough topic or evaluation leaves a marker, so an offline device can't bring it back.
- Device storage errors are shown instead of ignored. If storage fills, the offline copy of evaluations is
  cleared first; transcripts are no longer stored on the device (they stay in the account).
- Evaluation transcripts are stored in a separate field, so updating an evaluation never erases its transcript.
- Daily tasks older than 90 days are pruned; a warning appears if saved data nears the cloud size limit.
- Squad: new users are off the board until they opt in. Existing users keep their current choice.
  Board updates made while a previous update was sending are no longer dropped.

### Backup, restore, reset
- Backups (version 2) include everything: syllabus progress and revision history, hours, mocks,
  evaluations (optionally with transcripts), tough topics with review history, tasks, checklists, settings.
- Save as a file (where the viewer allows downloads) or copy as text. Restore from a file or pasted text.
- Restores are validated, previewed with counts, and confirmed. A restore point is saved first; one click undoes it.
  Version 1 backups still restore.
- Reset is selective (eight parts) with confirmation and a restore point.

### Timeline
- Block lengths use largest-remainder allocation with at least one day each. No zero or negative blocks,
  no gaps, and the plan always ends on the first paper (tested across 108 date/group combinations).
  Phases too short for one block per paper become a single "All papers (rapid)" block.
- Removed the 110-day cliff: first reading is always planned unless you tick "I've finished first reading"
  in Setup. A warning appears when first reading is squeezed into under 60 days. The "plan expects" figure
  now starts at 0% on day one.
- Clear messages when the plan start is on or after the first paper, or when the exam window is over.
- Exam schedule must fit within one 31-day window; you're warned if the plan start ends up after the first paper.

### Revision, hours, timer, mocks
- Each chapter keeps a revision history. Only ticking a stage or pressing "Revised today" counts as a
  revision; confidence and notes no longer reset the date. Ticking a later stage fills in earlier ones;
  unticking an earlier stage clears later ones (with a message).
- Focus timer sessions crossing midnight are split across both days; the 12-hour cap is announced.
- A day can't exceed 24 hours. "Log a past day" offers Add or Replace and rejects future dates.
- Mocks can be edited; marks are no longer capped at 100 when "Out of" is higher; future dates rejected.

### Evaluate
- Each question's marks are capped at its maximum; the total is the sum of question marks (capped at the
  paper total), with a note when questions seem missing or over-counted.
- Image limits load on demand (fixes the startup "isn't available" error); falls back to an available model tier.

### Other
- Swiping between sections now works over tables that are already scrolled to their edge.
- No slide animation on first load. Confidence dots announce their state to screen readers.
- `build.sh` builds `index.html` from `app.html`; `tests/phase1.test.js` holds 52 regression checks.
