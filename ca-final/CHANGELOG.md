# CA Final Rank Desk: changelog

## Phase 7: AIR performance analytics and readiness forecasting (no data format change)

Restore point: `archive/app-v7-pre-phase7.html`.

- **New Analytics tab** (after Evaluate). Tiles: mock average (last 3) with the average of each paper's own
  trend, readiness now, readiness at the exam at recent pace (and if you follow the plan), revision consistency
  (days with revision activity in 4 weeks), revision freshness, recall accuracy (4 weeks), questions solved
  unaided (60 days), recoverable marks on the latest mocks.
- **Insights** with evidence and links: papers needing attention (behind plan, low or falling mocks, stalled),
  chapters losing marks across mocks, recurring mistakes and the biggest mistake type, improving papers
  (mock trend and coverage), where marks can be recovered, and whether first-reading pace leaves time to revise.
- **Readiness forecast** per paper at its exam date, on the same six-part model: coverage, revision depth and
  question practice continue at the last 28 days' pace (rebuilt from chapter revision history); mocks project
  the last-three average plus half the recent per-mock improvement, one mock per fortnight; weak-topic rate,
  consistency and freshness held. A "follow the plan" scenario shows full coverage, revisions, practice and
  target hours. Assumptions and per-paper rates are shown; no marks or rank predictions.
- **Paper performance table** (readiness, coverage, revision, questions, last-3 mocks, trend, main mistake
  type, recoverable), **chapter readiness** for each paper (read 30, revision 25, questions 15, confidence 10,
  clean record 20), **loss concentration** in the top 3 chapters, 8-week study and revision bars, all-paper
  mock trend. The Readiness tile on Today now opens Analytics.
- `tests/phase7.test.js`: 30 checks. Phase 2 priority tests no longer depend on the day of the week.

## Phase 6: Advanced AI answer-sheet evaluator (no data format change; evaluations gain fields)

Restore point: `archive/app-v6-pre-phase6.html`.

- **Two stages with a check in between.** Read: Claude builds a question map from the paper (each question and
  sub-part, marks, requirement, chapter, optional choices, instructions, and up to 3 ICAI key points), reads the
  handwriting and labels where each answer starts ("### Q…"). The app splits the answers by question
  (normalising "Q 1 a", "2.(a)", "6b"; repeated numbers join as continuations). Check: each answer beside its
  question, editable, with a dropdown to reassign it. Flags: unclear words, uncertain figures, unnumbered or
  unmatched answers, questions with no answer, gaps in your page numbers, blank pages, text not assigned.
  The draft is saved so you can come back. Mark: each checked answer is marked against the map.
- **ICAI-oriented marking**: criteria scores (concepts, provisions, application, calculation, working notes and
  structure, conclusion: 0–2 or n/a), credited points, missing points, incorrect treatments, carry-forward flag,
  and every lost mark classified with the Phase 4 mistake types, plus a chapter for each question.
- **Validation in the app**: question maximums come from the map; unanswered questions score 0; "attempt any N"
  enforced (later optional answers marked "not counted"); marks capped and the total reconciled; lost marks
  never exceed max − awarded; unknown mistake types and chapters dropped.
- **Manual adjustment**: change any question's mark (0 to max, half marks) with a reason; the AI mark is kept and
  shown; the total and a saved mock update.
- **Report**: adds criteria chips, incorrect treatments, marks lost by type, reading issues at marking time,
  priority revision chapters, and "AI-estimated marks, not official ICAI marks".
- **Links**: Save to Mocks now carries classified mistakes with chapters (the rest as unclassified) and unattempted
  marks; "Add revision tasks to today's plan" adds the weakest chapters as Revise tasks; tough topics get chapter
  and main mistake type. Readiness, priorities and suggestions use finished evaluations only.
- **Fixes**: Claude features now load even when cloud sync isn't available; nested re-renders (an edit followed
  immediately by a click) are queued instead of erroring; a pending edit in another field is saved before any
  click or dropdown acts, so late change events can't overwrite newer data.
- `tests/phase6.test.js`: 34 checks. Earlier evaluator tests updated for the two-stage flow.

## Phase 5: Adaptive revision and tough topics engine (data version 5)

Restore point: `archive/app-v5-pre-phase5.html`. Data upgrades v4 → v5 automatically; tough topics convert to
the adaptive schedule (interval, ease, repetitions, lapses, question-solving attempts, source).

- **Adaptive spacing** per topic: Forgot / Hard / Good / Easy, each button showing the next gap. Good and Easy
  stretch the gap by the topic's ease; Hard and Forgot shrink it and lower the ease. Priority-A chapters and
  topics forgotten twice come back sooner; gaps are capped at half the days left to the paper so everything is
  reviewed before the exam. Overdue reviews get credit for the time actually elapsed.
- **Mastery score 0–100**: recall consistency 30, stability 15, solving questions unaided 20, unfamiliar
  questions 20, conceptual understanding 15 (own explanation written and no recent conceptual mock mistakes in
  the chapter). Mastered only with 80+, at least one question solved unaided, 4+ reviews and a 3-week gap.
  Old "mastered" topics without a recorded solved question return to active. After a Good/Easy review, the app
  asks whether you've solved a question on it; you can also record attempts on the topic.
- **Suggested tough topics** from mistakes repeated across mocks, mock mistakes of 4+ marks, weak evaluation
  answers and chapters rated 1–2 for confidence; add, add all or dismiss. New type "Practice question I got wrong".
- **Recall tests**: 62 built-in cards (Ind AS, Standards on Auditing, AFM formulas, Direct Tax, GST & Customs,
  definitions), filtered to your papers, due and weak cards first; 5 or 10 per test. Cards follow their own
  spacing. Missed cards become tough topics due today (switchable). Claude can write 5 questions on any chapter.
- **Revision analytics**: due and overdue, mastered, forgotten 2+ times, reviews this week, recall accuracy by
  week (reviews + recall tests), and "Review next" ordered by overdue days, priority, lapses and mastery gap.
- Mastered status is recalculated whenever topics load. Reset of tough topics also clears recall data.
- `tests/phase5.test.js`: 41 checks.

## Phase 4: Advanced mock performance analytics (data version 4)

Restore point: `archive/app-v4-pre-phase4.html`. Data upgrades v3 → v4 automatically (mocks gain a mistake log).

- **Mock details**: mock number, time taken, questions attempted / not attempted, marks left unattempted,
  difficulty, source. Validated: unattempted marks and logged mistakes can't exceed the marks not scored.
- **Mistake log per mock**: question, chapter, category (conceptual error, incorrect provision or standard,
  calculation, formula, misread the question, incomplete answer, presentation, time management, recall
  failure), marks lost, note. Shows marks not scored vs explained. Unclassified mistakes (from evaluations)
  can be classified in place. Any mistake can be sent to Tough topics in one click.
- **Analytics** (filter by paper): tiles for count, average, last three, best/worst, latest change,
  unattempted marks, recoverable marks and logged losses; trend chart; marks lost across six skills
  (concepts, application, calculation, presentation, time, recall) and by mistake type; chapters costing the
  most marks; repeated mistakes (same type, same chapter, 2+ mocks); per-paper table with last three, worst
  and change.
- **Recoverable marks**: lost marks split into easily recoverable (80%), needs more practice (50%) and needs
  conceptual work (30%), giving an "if fixed" score for the latest mock of each paper. Rates and reasoning
  are shown; unlogged lost marks are excluded and flagged.
- Evaluate → "Save to Mocks" now carries weak answers as unclassified mistakes, plus unattempted questions
  and marks (scaled so they never exceed marks not scored).
- New warning for mistakes repeated across mocks. Mock percentages rounded to 2 decimals.
- Evaluation results tolerate records with missing fields.
- `tests/phase4.test.js`: 33 checks.

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
