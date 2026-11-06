# CA Final Rank Desk

A single-page CA Final preparation tracker (new scheme, all 6 papers).

- `app.html`: the source, in Claude Artifact format. Signed in on claude.ai, data syncs to your account.
- `index.html`: standalone build of the same page (`./build.sh`). Data stays in the browser.
- `archive/`: earlier versions kept for recovery.
- `CHANGELOG.md`: what changed in each phase.

## Tests
```
./build.sh
node tests/phase1.test.js     # needs Playwright with Chromium
node tests/phase2.test.js
node tests/phase3.test.js
node tests/phase4.test.js
node tests/phase5.test.js
```
The tests use an in-memory stand-in for the Claude page runtime, so they run offline.

Chapter lists, priorities and quick-bank figures are a study aid. Verify them against ICAI study
material and announcements for your attempt.
