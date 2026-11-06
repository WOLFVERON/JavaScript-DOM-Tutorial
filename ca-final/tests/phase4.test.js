/* Phase 4 tests: mock details, mistake log, diagnosis, recoverable marks, evaluation hand-off.
   Run:  ./build.sh && node tests/phase4.test.js   (needs Playwright with Chromium) */
const {chromium} = require('playwright');
const path = require('path'), os = require('os');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const results = []; let failed = 0;
const ok = (name, cond, info) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond || info === undefined ? '' : '  → ' + JSON.stringify(info))); if (!cond) failed++; };
const ymd = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
const EX = {fr: '2028-11-02', afm: '2028-11-04', audit: '2028-11-06', dt: '2028-11-08', idt: '2028-11-10', ibs: '2028-11-12'};
const X = (q, cid, cat, lost, note) => ({id: 'x' + q + cat + lost, q, cid, cat, lost, note: note || ''});
const state = (o = {}) => Object.assign({v: 4, updatedAt: 5, ch: {}, log: {}, mocks: [], checks: {}, todos: {}, plan: {}, sessions: []}, o,
  {settings: Object.assign({startDate: ymd(-60), groups: 'both', tWd: 2.5, tWe: 8, revDays: 21, targetPct: 80, examDates: EX}, o.settings || {})});
async function open(b, st, hash = 'mocks', vp = {width: 1280, height: 900}) {
  const p = await b.newPage({viewport: vp}); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(st => { if (st) localStorage.setItem('caFinalRankDesk.v1', JSON.stringify(st)) }, st);
  await p.goto(URL + '#' + hash); await p.waitForTimeout(200); p.errs = errs; return p;
}
const MOCKS = [
  {id: 'a', paper: 'fr', num: 'MTP 1', date: ymd(-40), score: 58, max: 100, unattMarks: 14, mistakes: [X('1a', 'fr-4', 'calc', 4), X('2', 'fr-3', 'concept', 8), X('3b', 'fr-0', 'presentation', 3)]},
  {id: 'b', paper: 'fr', num: 'MTP 2', date: ymd(-20), score: 63, max: 100, unattMarks: 0, mistakes: [X('1', 'fr-4', 'calc', 5), X('4', 'fr-3', 'concept', 6), X('5', 'fr-1', 'formula', 4)]},
  {id: 'c', paper: 'fr', num: 'C3', date: ymd(-3), score: 55, max: 100, unattMarks: 12, mistakes: [X('2', 'fr-3', 'concept', 7), X('3', 'fr-4', 'calc', 3), X('6', 'fr-1', 'recall', 4), X('1b', null, 'unclassified', 3)]},
  {id: 'd', paper: 'audit', date: ymd(-10), score: 47, max: 100, mistakes: []}];

(async () => {
  const b = await chromium.launch();

  /* 1. upgrade v3 -> v4 */
  {
    const v3 = {v: 3, updatedAt: 5, settings: {startDate: ymd(-5)}, ch: {}, log: {}, mocks: [{id: 'm', paper: 'fr', date: ymd(-1), score: 50, max: 100}], checks: {}, todos: {}, plan: {}, sessions: []};
    const p = await open(b, v3);
    const r = await p.evaluate(() => ({v: S.v, mist: Array.isArray(S.mocks[0].mistakes), score: S.mocks[0].score}));
    ok('migration v4: mocks gain a mistake log, scores kept', r.v >= 4 && r.mist && r.score === 50, r);
    ok('migration v4: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 2. analytics maths */
  {
    const p = await open(b, state({mocks: MOCKS}));
    const r = await p.evaluate(() => {
      const L = mockLost(S.mocks.find(m => m.id === 'c')), R = recoverable(S.mocks.find(m => m.id === 'c')), sm = mockSummary(mocksIn('fr')), T = lossTotals(mocksIn('fr'));
      return {L, R, sm, T, ch: chapterLosses(mocksIn('fr')).map(e => e.cid + ':' + e.lost + ':' + e.n), rep: repeatedMistakes(mocksIn('fr')).map(e => e.cid + ':' + e.cat + ':' + e.n), change: mockChange(S.mocks.find(m => m.id === 'c'))};
    });
    ok('loss: mistakes, unattempted and unexplained marks add up to marks not scored', r.L.mist === 17 && r.L.unatt === 12 && r.L.unknown === 16 && r.L.mist + r.L.unatt + r.L.unknown === 45, r.L);
    ok('loss: categories map to skills (unattempted counts as time)', r.L.byDim.concept === 7 && r.L.byDim.calc === 3 && r.L.byDim.recall === 4 && r.L.byDim.time === 12, r.L.byDim);
    ok('loss: unclassified marks kept out of skills', r.L.byCat.unclassified === 3 && Object.values(r.L.byDim).reduce((a, b) => a + b, 0) === 26, r.L);
    ok('recoverable: easy 80%, practice 50%, conceptual 30%, rounded to half marks', r.R.buckets.easy.rec === 2.5 && r.R.buckets.practice.rec === 8 && r.R.buckets.concept.rec === 2 && r.R.rec === 12.5 && r.R.projected === 67.5, r.R.buckets);
    ok('summary: average, last three, best, worst, latest change', Math.round(r.sm.avg * 10) / 10 === 58.7 && r.sm.last3.join() === '58,63,55' && r.sm.best === 63 && r.sm.worst === 55 && r.change === -8, r.sm);
    ok('totals: logged losses across mocks', r.T.total === 15 + 14 + 15 + 17 + 12 && r.T.byCat.concept === 21, r.T);
    ok('chapters: ranked by marks lost, with mock counts', r.ch[0] === 'fr-3:21:3' && r.ch[1] === 'fr-4:12:3', r.ch);
    ok('repeated: same type in same chapter across 2+ mocks', r.rep.includes('fr-3:concept:3') && r.rep.includes('fr-4:calc:3') && !r.rep.some(x => x.startsWith('fr-1')), r.rep);
    const W = await p.evaluate(() => warnings().map(w => w.t));
    ok('warnings: repeated mock mistakes flagged', W.some(t => /Same mistake in 3 mocks: conceptual error/.test(t)), W);
    ok('analytics: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 3. add a mock with details; validation */
  {
    const p = await open(b, state());
    await p.fill('#mScore', '60'); await p.fill('#mMax', '100'); await p.fill('#mNum', 'MTP 1'); await p.fill('#mTime', '175'); await p.fill('#mQa', '5'); await p.fill('#mQu', '1'); await p.fill('#mUm', '50'); await p.selectOption('#mDiff', 'Hard');
    await p.click('#mockForm button.primary'); await p.waitForTimeout(80);
    const bad = await p.evaluate(() => ({n: S.mocks.length, toast: document.getElementById('toast').textContent}));
    ok('validation: unattempted marks can\'t exceed marks not scored', bad.n === 0 && /between 0 and 40/.test(bad.toast), bad);
    await p.fill('#mUm', '12'); await p.click('#mockForm button.primary'); await p.waitForTimeout(80);
    const m = await p.evaluate(() => S.mocks[0]);
    ok('mock: saved with number, time, questions, unattempted marks and difficulty', m.num === 'MTP 1' && m.timeMins === 175 && m.qAtt === 5 && m.qUnatt === 1 && m.unattMarks === 12 && m.diff === 'Hard' && Array.isArray(m.mistakes), m);
    ok('mock: its mistake log opens after saving', await p.evaluate(() => mkOpen === S.mocks[0].id && !!document.getElementById('mxForm')));
    /* log mistakes */
    await p.fill('#mxQ', '2(b)'); await p.selectOption('#mxCh', 'fr-3'); await p.selectOption('#mxCat', 'concept'); await p.fill('#mxLost', '8'); await p.fill('#mxNote', 'NCI'); await p.click('#mxForm button'); await p.waitForTimeout(60);
    await p.fill('#mxLost', '25'); await p.click('#mxForm button'); await p.waitForTimeout(60);
    const r = await p.evaluate(() => ({mist: S.mocks[0].mistakes, toast: document.getElementById('toast').textContent}));
    ok('mistakes: logged with question, chapter, category, marks and note', r.mist.length === 1 && r.mist[0].q === '2(b)' && r.mist[0].cid === 'fr-3' && r.mist[0].cat === 'concept' && r.mist[0].lost === 8 && r.mist[0].note === 'NCI', r.mist);
    ok('mistakes: total can\'t exceed the marks left to explain', /Only 20 marks are left/.test(r.toast), r.toast);
    await p.click('button[data-act="mxtough"]'); await p.waitForTimeout(60);
    const t = await p.evaluate(() => ({j: J.find(e => e.kind === 'Mock mistake'), flag: S.mocks[0].mistakes[0].tough}));
    ok('mistakes: one click sends a mistake to Tough topics', t.j && t.j.cid === 'fr-3' && /2\(b\)/.test(t.j.topic) && t.flag === true, t);
    await p.click('button[data-act="editmock"]'); await p.fill('#mScore', '95'); await p.fill('#mUm', ''); await p.click('#mockForm button.primary'); await p.waitForTimeout(60);
    ok('edit: can\'t lower marks-not-scored below what\'s already logged', await p.evaluate(() => S.mocks[0].score === 60 && /Remove some mistakes first/.test(document.getElementById('toast').textContent)));
    await p.click('button[data-act="mxdel"]'); await p.waitForTimeout(60);
    ok('mistakes: can be deleted', await p.evaluate(() => S.mocks[0].mistakes.length === 0));
    ok('mock form: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 4. UI: paper filter, diagnosis cards, recoverable card, classify */
  {
    const p = await open(b, state({mocks: MOCKS}));
    await p.click('button[data-act="mkp"][data-p="fr"]'); await p.waitForTimeout(60);
    const txt = await p.textContent('#main');
    ok('UI: tiles show last three, best/worst, change and recoverable for the paper', /58 · 63 · 55/.test(txt) && /63 \/ 55/.test(txt) && /-8/.test(txt) && /\+12\.5/.test(txt), txt.slice(0, 300));
    ok('UI: skills and mistake-type cards list losses, unclassified flagged', /Time management/.test(txt) && /Conceptual error/.test(txt) && /aren't classified yet/.test(txt));
    ok('UI: recoverable card shows the three buckets and assumptions', /Easily recoverable/.test(txt) && /Needs more practice/.test(txt) && /Needs conceptual work/.test(txt) && /Assumptions/.test(txt));
    ok('UI: chapters costing marks and repeated mistakes shown', /Chapters costing marks/.test(txt) && /3 mocks/.test(txt));
    await p.click('button[data-act="mkmist"][data-id="c"]'); await p.waitForTimeout(60);
    await p.selectOption('select[data-act="mxcat"]', 'calc'); await p.waitForTimeout(60);
    ok('classify: an unclassified mistake can be given a category', await p.evaluate(() => S.mocks.find(m => m.id === 'c').mistakes.every(x => x.cat !== 'unclassified')));
    const chart = await p.evaluate(() => document.querySelectorAll('svg polyline').length);
    ok('UI: paper filter limits the trend to that paper', chart === 1, chart);
    ok('UI: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 5. evaluation -> mock carries question detail */
  {
    const p = await open(b, state(), 'evaluate');
    const r = await p.evaluate(() => {
      EV.push({id: 'e1', created: 1, paper: 'dt', name: 'DT MTP', date: todayISO(), max: 100, result: {total: 50, questions: [
        {q: '1', max: 20, awarded: 20, status: 'full', missed: []}, {q: '2', max: 20, awarded: 12, status: 'partial', missed: ['No section cited']},
        {q: '3', max: 20, awarded: 5, status: 'weak', missed: []}, {q: '4', max: 20, awarded: 0, status: 'not_attempted', missed: []}, {q: '5', max: 20, awarded: 13, status: 'full', missed: []}]}});
      evOpen = 'e1'; render(); document.querySelector('button[data-act="evmock"]').click();
      const m = S.mocks[S.mocks.length - 1]; return {m, L: mockLost(m)};
    });
    ok('evaluate → mocks: every lost mark becomes a mistake (unclassified when the evaluation had no types)', r.m.mistakes.length === 3 && r.m.mistakes.map(x => x.lost).join() === '8,15,7' && r.m.mistakes.every(x => x.cat === 'unclassified'), r.m.mistakes);
    ok('evaluate → mocks: unattempted questions and marks recorded', r.m.qUnatt === 1 && r.m.qAtt === 4 && r.m.unattMarks === 20, r.m);
    ok('evaluate → mocks: never more than the marks not scored', r.L.total <= 50, r.L); await p.close();
  }

  /* 6. backup keeps mistakes; phone layout */
  {
    const p = await open(b, state({mocks: MOCKS}), 'mocks', {width: 390, height: 800});
    const r = await p.evaluate(() => readBackup(JSON.stringify(makeBackup(false))).state.mocks.find(m => m.id === 'c').mistakes.length);
    ok('backup: mistake logs included', r === 4, r);
    await p.click('button[data-act="mkmist"][data-id="c"]'); await p.waitForTimeout(450);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('phone: Mocks tab with an open mistake log has no sideways scroll or errors', over <= 0 && !p.errs.length, {over, e: p.errs}); await p.close();
  }

  await b.close();
  console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
