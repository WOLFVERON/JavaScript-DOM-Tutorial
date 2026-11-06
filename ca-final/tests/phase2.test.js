/* Phase 2 tests: command centre (readiness, warnings, priorities, overview).
   Run:  ./build.sh && node tests/phase2.test.js   (needs Playwright with Chromium) */
const {chromium} = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const results = []; let failed = 0;
const ok = (name, cond, info) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond || info === undefined ? '' : '  → ' + JSON.stringify(info))); if (!cond) failed++; };
const ymd = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
const EX = {fr: '2028-11-02', afm: '2028-11-04', audit: '2028-11-06', dt: '2028-11-08', idt: '2028-11-10', ibs: '2028-11-12'};
const state = o => Object.assign({v: 2, updatedAt: 5, settings: Object.assign({startDate: ymd(-60), groups: 'both', tWd: 2.5, tWe: 8, revDays: 21, targetPct: 80, examDates: EX}, o.settings || {}), ch: {}, log: {}, mocks: [], checks: {}, todos: {}}, o, {settings: Object.assign({startDate: ymd(-60), groups: 'both', tWd: 2.5, tWe: 8, revDays: 21, targetPct: 80, examDates: EX}, o.settings || {})});
async function open(b, st, journal, hash = 'today', vp = {width: 1280, height: 900}) {
  const p = await b.newPage({viewport: vp}); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(([st, j]) => { if (st) localStorage.setItem('caFinalRankDesk.v1', JSON.stringify(st)); if (j) localStorage.setItem('caFinalRankDesk.v1.journal', JSON.stringify(j)) }, [st, journal]);
  await p.goto(URL + '#' + hash); await p.waitForTimeout(200); p.errs = errs; return p;
}

(async () => {
  const b = await chromium.launch();

  /* 1. empty state */
  {
    const p = await open(b, null, null);
    const r = await p.evaluate(() => ({R: activePapers().map(x => paperReadiness(x.id).score), W: warnings().length, txt: document.body.textContent}));
    ok('empty: every paper starts at 0 readiness', r.R.every(x => x === 0), r.R);
    ok('empty: no warnings and the all-clear text shows', r.W === 0 && /No warnings right now/.test(r.txt), r.W);
    ok('empty: overview, priorities, readiness render without errors', /Readiness/.test(r.txt) && /Today's plan/.test(r.txt) && !p.errs.length, p.errs);
    await p.close();
  }

  /* 2. readiness model: full marks only with every part complete; no mock caps at 75 */
  {
    const ch = {}; for (let i = 0; i < 21; i++) ch['fr-' + i] = {r: true, r1: true, r2: true, r3: true, q: true, conf: 5, last: ymd(-1), hist: []};
    const log = {}; for (let i = 0; i < 28; i++) log[ymd(-i)] = {fr: 3};
    const mocks = [0, 1, 2].map(i => ({id: 'm' + i, paper: 'fr', date: ymd(-i - 1), score: 80, max: 100}));
    const p = await open(b, state({ch, log, mocks}), null);
    const full = await p.evaluate(() => paperReadiness('fr'));
    ok('readiness: complete preparation scores 100', full.score === 100 && Object.values(full.comp).every(v => Math.abs(v - 1) < 1e-9), full);
    const capped = await p.evaluate(() => { S.mocks = []; return paperReadiness('fr') });
    ok('readiness: without a mock the score stops at 75', capped.score === 75 && capped.noMock, capped.score);
    const half = await p.evaluate(() => { S.mocks = [{id: 'x', paper: 'fr', date: todayISO(), score: 40, max: 100}]; return paperReadiness('fr').comp.mocks });
    ok('readiness: mock part = latest average / target (40/80 = 0.5)', Math.abs(half - .5) < 1e-9, half);
    const stale = await p.evaluate(() => { for (const k in S.ch) S.ch[k].last = iso(addDays(new Date(), -60)); return paperReadiness('fr').comp.revision });
    ok('readiness: stale revisions lower the revision part (depth 70% only)', Math.abs(stale - .7) < 1e-9, stale);
    const prio = await p.evaluate(() => { S.ch = {}; S.ch['fr-0'] = {r: true}; const a = paperReadiness('fr').comp.coverage; S.ch = {}; S.ch['fr-16'] = {r: true}; const c = paperReadiness('fr').comp.coverage; return {a, c} });
    ok('readiness: a priority-A chapter counts 3× a priority-C chapter', Math.abs(prio.a / prio.c - 3) < 1e-9, prio);
    const weak = await p.evaluate(() => { S.ch = {}; for (let i = 0; i < 21; i++) S.ch['fr-' + i] = {r: true}; const before = paperReadiness('fr').comp.weak; S.ch['fr-0'].conf = 1; S.ch['fr-1'].conf = 2;
      J.push({id: 'w1', p: 'fr', topic: 't', reviews: [{d: todayISO(), r: 'forgot'}, {d: todayISO(), r: 'forgot'}], mastered: false}); const after = paperReadiness('fr'); J.pop(); return {before, after: after.comp.weak, load: after.info.load} });
    ok('readiness: weak chapters, open tough topics and forgotten reviews add load', weak.before === 1 && weak.load === 4 && weak.after < weak.before, weak);
    const sumOk = await p.evaluate(() => { const r = paperReadiness('fr'); const s = READY_PARTS.reduce((a, [k, , w]) => a + r.comp[k] * w, 0); return Math.round(Math.min(s, r.noMock ? NO_MOCK_CAP : 100)) === r.score });
    ok('readiness: score equals the sum of its shown parts', sumOk);
    ok('readiness: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 3. per-paper plan expectation follows the blocks */
  {
    const p = await open(b, state({settings: {startDate: ymd(-30)}}), null);
    const r = await p.evaluate(() => { const pl = buildPlan(); const cb = currentBlock(pl); return {block: cb && cb.b.label, fr: expectedPaper('fr', pl), dt: expectedPaper('dt', pl), idt: expectedPaper('idt', pl)} });
    ok('plan expectation: papers in the current block are expected to progress, later ones are not', r.block === 'FR + Audit' && r.fr > 0 && r.dt === 0 && r.idt === 0, r);
    await p.close();
  }

  /* 4. warnings */
  {
    const ch = {}; for (let i = 0; i < 5; i++) ch['audit-' + i] = {r: true, last: ymd(-1), hist: []};
    ch['fr-0'] = {r: true, last: ymd(-40), hist: []}; ch['fr-1'] = {r: true, last: ymd(-40), hist: []};
    const log = {}; for (let i = 1; i < 10; i++) log[ymd(-i)] = {audit: 0.5};
    const mocks = [{id: 'a', paper: 'fr', date: ymd(-30), score: 64, max: 100}, {id: 'b', paper: 'fr', date: ymd(-15), score: 66, max: 100}, {id: 'c', paper: 'fr', date: ymd(-2), score: 52, max: 100},
      {id: 'd', paper: 'audit', date: ymd(-3), score: 35, max: 100}, {id: 'e', paper: 'afm', date: ymd(-3), score: 45, max: 100}];
    const j = [{id: 'r1', p: 'fr', topic: 'Leases', reviews: [{d: ymd(-3), r: 'forgot'}, {d: ymd(-1), r: 'forgot'}], mastered: false, due: ymd(5), box: 0}];
    const p = await open(b, state({ch, log, mocks, settings: {startDate: ymd(-150)}}), j);
    const W = await p.evaluate(() => warnings().map(w => w.sev + '|' + w.t));
    const has = re => W.some(w => re.test(w));
    ok('warnings: falling mock score flagged as urgent', has(/^3\|FR mock score fell 13 points/), W);
    ok('warnings: mock below 40 flagged as urgent', has(/^3\|Latest Audit mock is below 40/), W);
    ok('warnings: group aggregate below 50% flagged', has(/^3\|Group I aggregate is below 50%/), W);
    ok('warnings: paper behind plan flagged', has(/FR is \d+% behind plan/), W);
    ok('warnings: focus-block paper with no study flagged', has(/No FR study in the last 10 days/), W);
    ok('warnings: stale priority-A chapters flagged', has(/2 priority-A FR chapters need revision/), W);
    ok('warnings: repeated mistakes flagged', has(/1 tough topic forgotten twice or more/), W);
    ok('warnings: reading without practice flagged', has(/5 Audit chapters read without question practice/), W);
    ok('warnings: hours shortfall flagged', has(/of 28\.5 target hours this week|target hours this week/), W);
    ok('warnings: sorted most serious first', W.every((w, i) => i === 0 || +W[i - 1][0] >= +w[0]), W);
    const near = await p.evaluate(() => { const d = iso(addDays(new Date(), 28)); S.settings.examDates = defaultDates(d); S.settings.startDate = iso(addDays(new Date(), -100)); return warnings().filter(w => / in \d+ days?$/.test(w.t)).map(w => w.t) });
    ok('warnings: deadlines within 14 days flagged', near.some(t => /Admit card/.test(t)) && near.some(t => /Final revision starts/.test(t)), near);
    ok('warnings: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 5. priorities */
  {
    const ch = {}; for (let i = 0; i < 8; i++) ch['fr-' + i] = {r: true, conf: i < 3 ? 2 : 4, last: ymd(-30), hist: []};
    const j = [{id: 'd1', p: 'fr', topic: 'A', reviews: [], mastered: false, due: ymd(0), box: 0}, {id: 'd2', p: 'audit', topic: 'B', reviews: [], mastered: false, due: ymd(-2), box: 0}];
    const p = await open(b, state({ch, settings: {startDate: ymd(-20)}}), j);
    const P = await p.evaluate(() => priorities());
    const kinds = P.list.map(x => x.kind);
    ok('priorities: weekday plan adds up to the 2.5 h target', P.mins === 150 && P.target === 150 && P.list.length >= 2 && P.list.length <= 5, {mins: P.mins, n: P.list.length});
    ok('priorities: a task that does not fit becomes a partial session', P.list.filter(x => x.part).length <= 1 && P.list.every(x => !x.part || (x.mins < x.full && x.mins >= 20)), P.list.map(x => [x.kind, x.mins, x.full]));
    ok('priorities: due tough topics come first as a review', kinds.includes('Review') && P.list.find(x => x.kind === 'Review').t === 'Review 2 tough topics', kinds);
    ok('priorities: first-reading phase always includes new reading', kinds.includes('Learn'), kinds);
    ok('priorities: no more than 2 tasks of one kind on a weekday', ['Revise', 'Learn', 'Practise', 'Mock'].every(k => kinds.filter(x => x === k).length <= 2), kinds);
    ok('priorities: every task has paper context, duration, reason and benefit', P.list.every(x => x.mins > 0 && x.why && x.gain && x.level), P.list);
    const shown = await p.evaluate(() => S.plan[todayISO()].tasks.map(x => x.t));
    ok('priorities: shown on Today as the day plan (same tasks)', shown.length === P.list.length && shown.every((t, i) => t === P.list[i].t), {shown, p: P.list.map(x => x.t)});
    const mock = await p.evaluate(() => { S.ch = {}; for (let i = 0; i < 18; i++) S.ch['fr-' + i] = {r: true, last: todayISO(), hist: []}; J.length = 0; S.settings.tWd = 8; S.settings.tWe = 8; return priorities().list.map(x => x.kind + ':' + x.t) });
    ok('priorities: suggests a mock when a paper is well covered but has none', mock.some(x => /^Mock:Write a full FR mock/.test(x)), mock);
    const wk = await p.evaluate(() => { S.settings.tWd = 8; S.settings.tWe = 8; const r = priorities(); S.settings.tWd = 2.5; S.settings.tWe = 8; return {mins: r.mins, n: r.list.length} });
    ok('priorities: 8-hour day plan adds up to 8 h with more tasks', wk.mins === 480 && wk.n >= 4 && wk.n <= 7, wk);
    const off = await p.evaluate(() => { J.push({id: 'z', p: 'fr', topic: 'Z', reviews: [], mastered: false, due: todayISO(), box: 0}); S.settings.tWd = 0; S.settings.tWe = 0; const r = priorities(); S.settings.tWd = 2.5; S.settings.tWe = 8; J.pop(); return r.list.map(x => x.kind) });
    ok('priorities: on a 0-hour day only due reviews are suggested', off.length === 1 && off[0] === 'Review', off);
    const fresh = await p.evaluate(() => { S.ch = {}; J.length = 0; S.settings.tWd = 8; S.settings.tWe = 8; const r = priorities(); return {mins: r.mins, kinds: r.list.map(x => x.kind)} });
    ok('priorities: brand-new user still gets a full day of reading, no practice on unread papers', fresh.mins === 480 && fresh.kinds.every(k => k === 'Learn'), fresh);
    ok('priorities: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 5b. focus timer logs from 1 minute */
  {
    const p = await open(b, state({}), null);
    const r = await p.evaluate(() => { const t0 = Date.now(); timer = {p: 'fr', start: t0 - 61000}; render(); document.querySelector('button[data-act="tstop"]').click(); const a = hoursOn(todayISO());
      timer = {p: 'fr', start: Date.now() - 50000}; render(); document.querySelector('button[data-act="tstop"]').click(); const b2 = hoursOn(todayISO()); return {a, b2, toast: document.getElementById('toast').textContent} });
    ok('timer: a 1-minute session is logged (about 0.017 h)', Math.abs(r.a - 1 / 60) < 0.002, r);
    ok('timer: under 1 minute logs nothing and says so', r.b2 === r.a && /Under 1 minute/.test(r.toast), r);
    await p.close();
  }

  /* 6. readiness breakdown in the UI matches the score */
  {
    const ch = {}; for (let i = 0; i < 10; i++) ch['fr-' + i] = {r: true, r1: i < 5, q: i < 6, last: ymd(-3), hist: []};
    const p = await open(b, state({ch, mocks: [{id: 'a', paper: 'fr', date: ymd(-1), score: 60, max: 100}]}), null);
    await p.click('button[data-act="rdy"][data-p="fr"]');
    const r = await p.evaluate(() => { const nums = Array.from(document.querySelectorAll('.calc .num')).map(e => e.textContent); const parts = nums.slice(0, 6).map(t => +t.split('=')[1]); return {sum: parts.reduce((a, b) => a + b, 0), score: +nums[6], n: nums.length} });
    ok('UI: "How it\'s scored" shows six parts that add up to the score', r.n === 7 && Math.abs(r.sum - r.score) <= 0.6, r);
    await p.close();
  }

  /* 7. overview tiles and layout on desktop and phone */
  for (const vp of [{width: 1280, height: 900}, {width: 390, height: 800}]) {
    const p = await open(b, state({mocks: [{id: 'a', paper: 'dt', date: ymd(-1), score: 61, max: 100}]}), null, 'today', vp);
    const r = await p.evaluate(() => ({tiles: document.querySelectorAll('.tile').length, cols: getComputedStyle(document.querySelector('.tiles')).gridTemplateColumns.split(' ').length, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, latest: document.querySelector('.tiles').textContent.includes('latest DT 61%')}));
    ok(`overview ${vp.width}px: 8 tiles in ${vp.width > 720 ? 4 : 2} even columns, latest mock shown`, r.tiles === 8 && r.cols === (vp.width > 720 ? 4 : 2) && r.latest, r);
    ok(`overview ${vp.width}px: no sideways scroll, no errors`, r.over <= 0 && !p.errs.length, {r, e: p.errs}); await p.close();
  }

  await b.close();
  console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
