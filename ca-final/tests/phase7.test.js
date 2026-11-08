/* Phase 7 tests: progress replay, pace, forecast, chapter readiness, consistency, insights, Analytics tab.
   Run:  ./build.sh && node tests/phase7.test.js   (needs Playwright with Chromium) */
const {chromium} = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const results = []; let failed = 0;
const ok = (name, cond, info) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond || info === undefined ? '' : '  → ' + JSON.stringify(info))); if (!cond) failed++; };
const ymd = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
const EX = {fr: '2027-05-02', afm: '2027-05-04', audit: '2027-05-06', dt: '2027-05-08', idt: '2027-05-10', ibs: '2027-05-12'};
const X = (q, cid, cat, lost) => ({id: 'x' + q + cat + cid, q, cid, cat, lost});
function seed() {
  const ch = {};
  for (let i = 0; i < 14; i++) { const d = -45 + i * 3; ch['fr-' + i] = {r: true, r1: i < 6, q: i < 8, conf: i === 3 ? 2 : 4, last: ymd(d + (i < 6 ? 10 : 0)), hist: [{d: ymd(d), s: 'r'}].concat(i < 6 ? [{d: ymd(d + 10), s: 'r1'}] : []).concat(i < 8 ? [{d: ymd(d + 1), s: 'q'}] : [])} }
  for (let i = 0; i < 6; i++) ch['audit-' + i] = {r: true, last: ymd(-50), hist: [{d: ymd(-50), s: 'r'}]};
  return {v: 5, updatedAt: 5, settings: {startDate: ymd(-60), groups: '1', tWd: 2.5, tWe: 8, revDays: 21, targetPct: 80, examDates: EX}, ch,
    log: Object.fromEntries(Array.from({length: 50}, (_, i) => [ymd(-i), {fr: i % 7 === 0 ? 0 : 2}])), checks: {}, todos: {}, plan: {}, sessions: [],
    recall: {}, recallLog: [{id: 'l', at: 1, d: ymd(-3), area: 'all', n: 10, right: 6, partial: 2}], tsDismiss: {},
    mocks: [{id: 'a', paper: 'fr', date: ymd(-40), score: 48, max: 100, mistakes: [X('1', 'fr-3', 'concept', 8), X('2', 'fr-4', 'calc', 5)]},
      {id: 'b', paper: 'fr', date: ymd(-25), score: 54, max: 100, mistakes: [X('1', 'fr-3', 'concept', 7), X('2', 'fr-4', 'calc', 4)]},
      {id: 'c', paper: 'fr', date: ymd(-8), score: 61, max: 100, mistakes: [X('3', 'fr-3', 'concept', 6), X('4', 'fr-1', 'formula', 3)]},
      {id: 'd', paper: 'audit', date: ymd(-6), score: 44, max: 100, mistakes: [X('2', 'audit-5', 'provision', 6)]}]};
}
async function open(b, st, journal, hash = 'analytics', vp = {width: 1280, height: 900}) {
  const p = await b.newPage({viewport: vp}); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(([st, j]) => { if (st) localStorage.setItem('caFinalRankDesk.v1', JSON.stringify(st)); if (j) localStorage.setItem('caFinalRankDesk.v1.journal', JSON.stringify(j)) }, [st, journal]);
  await p.goto(URL + '#' + hash); await p.waitForTimeout(250); p.errs = errs; return p;
}

(async () => {
  const b = await chromium.launch();

  /* 1. progress replay from revision history */
  {
    const st = seed();
    st.ch['afm-0'] = {r: true, r1: true, last: ymd(-3), hist: [{d: ymd(-10), s: 'r'}, {d: ymd(-3), s: 'r1'}]};
    st.ch['afm-1'] = {r: false, hist: [{d: ymd(-10), s: 'r'}]};                 // read then unticked
    st.ch['afm-2'] = {r: true, last: ymd(-2), hist: []};                         // pre-history data, recent date
    st.ch['afm-3'] = {r: true, hist: []};                                        // no date at all
    st.ch['afm-4'] = {r: true, r1: true, r2: true, last: ymd(-40), hist: [{d: ymd(-40), s: 'legacy'}]};
    const p = await open(b, st);
    const r = await p.evaluate(() => ({mid: flagsAt('afm-0', iso(addDays(new Date(), -5))), now: flagsAt('afm-0', todayISO()), before: flagsAt('afm-0', iso(addDays(new Date(), -20))),
      untick: flagsAt('afm-1', todayISO()), pre: [flagsAt('afm-2', iso(addDays(new Date(), -5))).r, flagsAt('afm-2', todayISO()).r], nodate: flagsAt('afm-3', iso(addDays(new Date(), -400))).r, legacy: flagsAt('afm-4', iso(addDays(new Date(), -30)))}));
    ok('replay: stages appear on the day they were recorded', r.mid.r && !r.mid.r1 && r.now.r1 && !r.before.r, r);
    ok('replay: an unticked chapter never counts, whatever its history', !r.untick.r, r.untick);
    ok('replay: older data uses its last date, or counts as done long ago', r.pre[0] === false && r.pre[1] === true && r.nodate === true, r);
    ok('replay: legacy history keeps the stages ticked at upgrade time', r.legacy.r && r.legacy.r1 && r.legacy.r2, r.legacy);
    await p.close();
  }

  /* 2. pace, forecast and assumptions */
  {
    const p = await open(b, seed());
    const r = await p.evaluate(() => { const F = {fr: forecast('fr'), afm: forecast('afm'), audit: forecast('audit')}; const now = compsAt('fr', todayISO()), past = compsAt('fr', iso(addDays(new Date(), -28))); return {F, now, past} });
    const fr = r.F.fr;
    ok('pace: coverage gained over 4 weeks becomes a daily rate', Math.abs(fr.rate.coverage - (r.now.coverage - r.past.coverage) / 28) < 1e-9 && fr.rate.coverage > 0, fr.rate);
    ok('forecast: recent pace lifts FR above today, plan scenario at least as high', fr.pace > fr.now && fr.plan >= fr.pace && fr.pace <= 100, fr);
    ok('forecast: mock projection = last-3 average + half the trend per fortnightly mock', Math.abs(fr.mockProj - Math.min(100, fr.MT.avg3 + fr.MT.slope * (fr.days / 14) * 0.5)) < 1e-6 && Math.abs(fr.MT.slope - 6.5) < 1e-9, {proj: fr.mockProj, mt: fr.MT});
    ok('forecast: first reading finish date = remaining coverage / pace', fr.finishDays === Math.ceil((1 - fr.R.comp.coverage) / fr.rate.coverage), fr.finishDays);
    ok('forecast: no recent progress means a flat pace and no finish date', r.F.audit.pace === r.F.audit.now && r.F.audit.finishDays === null && r.F.audit.thin.events === 0, r.F.audit);
    ok('forecast: a paper without mocks stays capped at 75 even with the plan', r.F.afm.plan === 75 && r.F.afm.mockProj === null, r.F.afm);
    await p.close();
  }

  /* 3. chapter readiness, consistency, accuracy, concentration */
  {
    const st = seed(); st.plan = {[ymd(-2)]: {created: 1, target: 150, tasks: [{id: 't', kind: 'Revise', status: 'done', mins: 60}]}};
    const j = [{id: 'j', p: 'fr', cid: 'fr-3', topic: 'NCI', v: 2, ease: 2.3, ivl: 3, reps: 1, lapses: 0, apps: [{d: ymd(-5), type: 'std', ok: true}, {d: ymd(-4), type: 'new', ok: false}], reviews: [{d: ymd(-1), r: 'good'}], due: ymd(2), created: ymd(-10), src: 'manual'}];
    const p = await open(b, st, j);
    const r = await p.evaluate(() => ({c3: chapterReadiness('fr-3'), c10: chapterReadiness('fr-10'), c20: chapterReadiness('fr-20'), rc: revisionConsistency(), pa: practiceAccuracy(), lc: lossConcentration()}));
    ok('chapter: repeated mock losses and an open tough topic remove the clean-record points', r.c3.lost === 21 && r.c3.tt === 1 && r.c3.parts.clean === 0, r.c3);
    ok('chapter: unread chapter scores 0; score adds up its parts', r.c20.score === 0 && r.c10.score === Math.round(r.c10.parts.read * 30 + r.c10.parts.revision * 25 + r.c10.parts.questions * 15 + r.c10.parts.confidence * 10 + r.c10.parts.clean * 20), r.c10);
    ok('consistency: distinct days from reviews, recall tests, revision ticks and done plan revisions', r.rc.days >= 4 && r.rc.of === 28 && r.rc.freshness > 0 && r.rc.freshness < 1, r.rc);
    ok('accuracy: recall (right + half partly) and questions solved unaided', Math.abs(r.pa.recall - 0.7) < 1e-9 && r.pa.solved === 0.5, r.pa);
    ok('concentration: share of lost marks from the top 3 chapters', r.lc.top[0].cid === 'fr-3' && Math.abs(r.lc.share - (21 + 9 + 6) / 39) < 1e-9, r.lc);
    await p.close();
  }

  /* 4. insights */
  {
    const p = await open(b, seed());
    const r = await p.evaluate(() => Object.fromEntries(insights().sections.map(s => [s.k, s.items.map(x => x.text)])));
    ok('insights: six sections', Object.keys(r).join() === 'attention,chapters,mistakes,improving,recover,pace', Object.keys(r));
    ok('insights: Audit flagged for attention (behind plan, low mock, stalled)', r.attention.some(t => /^Audit:/.test(t) && /mocks average 44%/.test(t)), r.attention);
    ok('insights: chapter losing marks across mocks named', r.chapters.some(t => /Consolidation/.test(t) && /21 marks lost across 3 mocks/.test(t)), r.chapters);
    ok('insights: recurring mistake and the biggest mistake type', r.mistakes.some(t => /Conceptual error/.test(t)) && r.mistakes.some(t => /Biggest mistake type/.test(t)), r.mistakes);
    ok('insights: FR shown as improving in mocks and coverage', r.improving.some(t => /FR: up 6\.5 points per mock/.test(t)) && r.improving.some(t => /coverage up/.test(t)), r.improving);
    ok('insights: recoverable marks and pace (stalled papers first)', r.recover.length >= 1 && /no new chapters/.test(r.pace[0]) && r.pace.some(t => /FR: first reading done in about/.test(t)), {rec: r.recover, pace: r.pace});
    await p.close();
  }

  /* 5. Analytics tab UI */
  {
    const p = await open(b, seed());
    const txt = await p.textContent('#main');
    ok('UI: tiles, insights, forecast, paper table, chapter readiness, losses, trend', ['Mock average', 'Readiness now', 'At exam, recent pace', 'Revision consistency', 'Recall accuracy', 'Solved unaided', 'Insights', 'Readiness forecast at each exam', 'Chapter readiness', 'Where losses concentrate', 'Mock trend, all papers'].every(k => txt.includes(k)));
    ok('UI: no marks or rank predictions promised', /No marks or rank predictions/.test(txt) && !/\bAIR\b\s*\d|predicted rank/i.test(txt));
    ok('UI: overall trend uses each paper\'s own trend', /papers trending \+6\.5 per mock/.test(txt), txt.match(/papers trending[^\n]{0,20}/));
    await p.click('button[data-act="anp"][data-p="audit"]'); await p.waitForTimeout(60);
    ok('UI: chapter readiness switches paper', await p.evaluate(() => anPaper === 'audit' && /not read yet/.test(document.body.textContent)));
    await p.click('button[data-act="anp"][data-p="fr"]'); await p.click('button[data-act="anall"]'); await p.waitForTimeout(60);
    ok('UI: show all chapters', await p.evaluate(() => document.querySelectorAll('.card .lossrow').length >= 14));
    await p.evaluate(() => location.hash = 'today'); await p.waitForTimeout(450);
    ok('Today: readiness tile links to Analytics', await p.evaluate(() => !!document.querySelector('a.tile[href="#analytics"]')));
    ok('UI: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 6. empty state and phone */
  {
    const p = await open(b, null, null, 'analytics', {width: 390, height: 800});
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({txt: document.body.textContent, over: document.documentElement.scrollWidth - document.documentElement.clientWidth}));
    ok('empty: renders with helpful empty states', /needs mocks/.test(r.txt) && /No chapter has lost marks/.test(r.txt));
    ok('phone: no sideways scroll or errors', r.over <= 0 && !p.errs.length, {over: r.over, e: p.errs}); await p.close();
  }

  await b.close();
  console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
