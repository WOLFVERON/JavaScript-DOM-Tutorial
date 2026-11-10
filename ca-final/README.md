# CA Final Rank Desk

A CA Final (new scheme) preparation and performance system in a single page.

- `app.html`: the source, in Claude Artifact format. Signed in on claude.ai, data syncs to your account and
  Claude-powered features (evaluation, revision cards, recall quizzes) are available.
- `index.html`: standalone build of the same page (`./build.sh`). Data stays in the browser; Claude features are off.
- `archive/`: the version before each upgrade phase, for recovery.
- `CHANGELOG.md`: what changed in each phase.

## How it fits together
Learn → Practise → Revise → Mock → Evaluate → Mistakes → Correct → Reassess

| Tab | Role |
|---|---|
| Today | Command centre: overview, preparation loop, daily plan, warnings, paper readiness, timer |
| Syllabus | Chapter progress (read, revisions, questions, confidence) with revision history |
| Tough topics | Adaptive spaced revision, mastery scores, suggestions, recall tests |
| Timeline | Phase plan to the first paper, milestones |
| Mocks | Mock details, mistake logs, skill and category losses, recoverable marks |
| Evaluate | Read → check → mark answer sheets against ICAI practice (AI estimates) |
| Analytics | Trends, insights, chapter readiness, readiness forecast (no rank predictions) |
| Hours | Study hours, focus sessions |
| Squad | Opt-in leaderboard with per-person sharing choices |
| Setup | Attempt settings, shared exam schedule, backup, restore, selective reset |

Data is versioned (currently version 5) and upgrades automatically, with a restore point saved first.

## Tests
```
./build.sh
for n in 1 2 3 4 5 6 7 8; do node tests/phase$n.test.js; done   # needs Playwright with Chromium
```
The tests use an in-memory stand-in for the Claude page runtime, so they run offline.

Chapter lists, priorities and quick-bank and recall figures are a study aid. Verify them against ICAI study
material and announcements for your attempt; Direct Tax and GST figures depend on the Act applicable to it.
