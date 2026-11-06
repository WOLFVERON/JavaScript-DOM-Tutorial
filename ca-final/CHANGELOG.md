# CA Final Rank Desk: changelog

## Phase 3: Intelligent daily study planner (data version 3)

Restore point: `archive/app-v3-pre-phase3.html`. Data upgrades v2 → v3 automatically, with a restore point.

- **Today's plan** replaces "Today's priorities": one plan per day, filling the day's target, with
  Start / Done / Skip / Tomorrow on each task, Reopen / Restore, and "Rebuild today's plan" (keeps tasks you
  acted on, re-plans the rest). Plans are built in memory and saved when you act on them; kept for 30 days.
- **Rescheduling**: unfinished tasks from earlier days are re-checked (dropped if the chapter has since been
  read, revised, practised or mocked) and carried forward with a priority boost that grows with age. Carried
  work takes at most half the day (the first-reading slot may exceed it); the rest waits in a backlog that's
  reported on the plan, with a warning once it exceeds a day. Tasks older than 14 days expire. Partial reading
  sessions continue the next day with the remaining time. Skipped tasks don't carry; "Tomorrow" carries.
- **Done updates Syllabus**: Learn ticks Read (not for partial sessions), Revise records the next revision
  stage and date, Practise ticks Questions. Reopening keeps the tick, and says so.
- **Focus timer**: choose paper, chapter (optional) and planned length (25 min to 3 h), or press Start on a
  plan task. Shows elapsed vs planned with a progress bar and a "planned time reached" note. Each session is
  saved (paper, chapter, task, planned and actual minutes) and logs hours as before; task-linked sessions
  record progress on the task.
- **Hours → Focus sessions**: today's sessions, last 7 days' focus time, average length, how often sessions
  reach the planned time, and the latest 15 sessions.
- Sync merges sessions from both devices; backups include plans and sessions; reset clears them with
  "Daily plans and your own tasks" and "Study hours, focus sessions…". The manual list is now "Your own tasks".
- `tests/phase3.test.js`: 35 checks. Phase 1 and 2 suites updated for the new version and plan card.

## Phase 2.1: priorities fill the day; 1-minute focus timer

- Today's priorities now add up to today's study target (weekday / weekend hours). Highest-value tasks go
  first; due tough-topic reviews and, in first reading, the next chapter always get a slot. A task that
  doesn't fit becomes a partial session ("45 min of about 2 h today, continue tomorrow"). 8-hour days allow
  up to 7 tasks and 3 per paper. Leftover time goes to question practice on the weakest started paper, or
  to the next unread chapter. A 0-hour day only suggests due reviews.
- Focus timer logs any session of 1 minute or more (whole minutes counted); hours are stored to the
  nearest few seconds so short sessions aren't rounded up.

## Phase 2: AIR Command Centre (no data format change)

Restore point: `archive/app-v2-pre-phase2.html`.

- **Overview strip** on Today: readiness, syllabus vs plan, this week's hours vs target, total hours,
  consistency (days on target in 14) and streak, mock average (last 3) and latest mock, revisions due and
  weak chapters, next paper countdown. Each tile links to its section.
- **Paper readiness (0–100)** for each active paper: coverage 25, revision depth and freshness 20, question
  practice 15, mocks 25, weak-topic load 10, consistency 5. Chapters weighted by priority (A 3, B 2, C 1).
  Capped at 75 until the paper has a mock. "How it's scored" shows every part and its inputs; the parts add
  up to the score. Labelled as a preparation measure, not a marks prediction.
- **Warnings**, most serious first: paper behind plan (per-paper expectation from the timeline blocks),
  focus-block paper not studied for 10 days, stale priority-A chapters, mock below 40, falling mock score,
  group aggregate below 50%, tough topics forgotten twice, reading without question practice, weekly hours
  under 70% of target, many reviews due, estimated deadlines within 14 days.
- **Today's priorities**: 3–5 tasks scored from your data (due tough topics, evaluation mistakes not yet
  corrected, overdue or low-confidence revisions, next unread chapter in the focus block, question practice,
  a mock when coverage is high or the mock phase has started), sized to today's hours. Each shows paper,
  kind, duration, priority, why it was chosen and the expected benefit, with "Add to today's tasks".
- The old "Paper progress" card is replaced by the readiness table. "Due for revision" now also lists read
  chapters that were never revised.
- Timeline milestones moved into a shared function used by both the timeline and warnings.
- `tests/phase2.test.js`: 37 checks (readiness maths, plan expectations, each warning, priorities, UI, layout).

## Phase 1.1: view-only access handling

- Cause of "Not synced yet, retrying" on friends' phones: people outside the owner's organization are
  view-only on a shared page unless invited as Editor (even when invited as Contributor), and view-only
  people can't save data, including their own. The app retried those refused saves forever.
- The app now checks access on load (and treats a refused save the same way): it stops retrying, keeps
  progress on the device, says so, and tells the person to ask for Editor access. Squad explains the fix
  and disables "Show me on the board" until access allows it. Progress made meanwhile syncs once access is fixed.
- Save errors are classified: refused (no retry), data too large, storage full, access changed, or
  temporary (retry; slower backoff when rate-limited).
- Squad invite instructions now say to invite friends as Editor, with the cautions that Editors can change
  the page and that turning on link sharing makes outside Editors view-only.

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
