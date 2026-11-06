/* Phase 5 tests: adaptive scheduling, mastery, suggestions, recall tests, revision analytics.
   Run:  ./build.sh && node tests/phase5.test.js   (needs Playwright with Chromium) */
const {chromium} = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const results = []; let failed = 0;
const ok = (name, cond, info) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond || info === undefined ? '' : '  → ' + JSON.stringify(info))); if (!cond) failed++; };
const ymd = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
const EX = {fr: '2028-11-02', afm: '2028-11-04', audit: '2028-11-06', dt: '2028-11-08', idt: '2028-11-10', ibs: '2028-11-12'};
const state = (o = {}) => Object.assign({v: 5, updatedAt: 5, ch: {}, log: {}, mocks: [], checks: {}, todos: {}, plan: {}, sessions: [], recall: {}, recallLog: [], tsDismiss: {}}, o,
  {settings: Object.assign({startDate: ymd(-60), groups: 'both', tWd: 2.5, tWe: 8, revDays: 21, targetPct: 80, examDates: EX}, o.settings || {})});
async function open(b, st, journal, hash = 'journal', vp = {width: 1280, height: 900}) {
  const p = await b.newPage({viewport: vp}); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(([st, j]) => { if (st) localStorage.setItem('caFinalRankDesk.v1', JSON.stringify(st)); if (j) localStorage.setItem('caFinalRankDesk.v1.journal', JSON.stringify(j)) }, [st, journal]);
  await p.goto(URL + '#' + hash); await p.waitForTimeout(200); p.errs = errs; return p;
}

(async () => {
  const b = await chromium.launch();

  /* 1. upgrade: v4 state and old-style topics */
  {
    const v4 = {v: 4, updatedAt: 5, settings: {startDate: ymd(-5)}, ch: {}, log: {}, mocks: [], checks: {}, todos: {}, plan: {}, sessions: []};
    const old = [{id: 'o1', p: 'fr', cid: 'fr-0', topic: 'T', kind: 'Concept', created: ymd(-40), box: 5, due: ymd(10), reviews: [1, 2, 3, 4, 5, 6].map(i => ({d: ymd(-40 + i * 5), r: 'good'})), mastered: true}];
    const p = await open(b, v4, old);
    const r = await p.evaluate(() => ({v: S.v, rec: isObj(S.recall), log: Array.isArray(S.recallLog), e: J[0], auto: S.settings.autoRecall}));
    ok('migration v5: recall data added, auto-add setting on', r.v === 5 && r.rec && r.log && r.auto === true, r);
    ok('topics upgrade: interval, reps, ease and source set from old boxes', r.e.v === 2 && r.e.ivl === 60 && r.e.reps === 5 && r.e.ease === 2.3 && r.e.src === 'manual' && r.e.box === undefined, r.e);
    ok('topics upgrade: old "mastered" without a solved question becomes active again', r.e.mastered === false, r.e.mastered);
    ok('upgrade: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 2. adaptive scheduling */
  {
    const p = await open(b, state(), [{id: 't', p: 'afm', cid: 'afm-8', topic: 'B', v: 2, ease: 2.3, ivl: 0, reps: 0, lapses: 0, apps: [], reviews: [], due: ymd(0), created: ymd(-1), src: 'manual'}]);
    const r = await p.evaluate(() => {
      const e = J[0], seq = [];
      for (const g of ['good', 'good', 'good']) seq.push(schedule(e, g));
      const easyPrev = previewIvl(e, 'easy'), goodPrev = previewIvl(e, 'good'), hardPrev = previewIvl(e, 'hard');
      const before = e.ease; schedule(e, 'forgot');
      const afterForgot = {ivl: e.ivl, reps: e.reps, lapses: e.lapses, ease: e.ease, due: e.due};
      const A = {id: 'a', p: 'fr', cid: 'fr-0', ease: 2.3, ivl: 10, reps: 3, lapses: 0, reviews: []}, C = Object.assign({}, A, {cid: 'fr-16'});
      const near = Object.assign({}, A, {p: 'dt', cid: 'dt-2'}); S.settings.examDates = Object.assign({}, S.settings.examDates, {dt: iso(addDays(new Date(), 10))});
      const often = Object.assign({}, A, {lapses: 2});
      return {seq, easyPrev, goodPrev, hardPrev, before, afterForgot, a: previewIvl(A, 'good'), c: previewIvl(C, 'good'), near: previewIvl(near, 'good'), often: previewIvl(often, 'good')};
    });
    ok('schedule: Good grows the gap (1 → 3 → ×ease)', r.seq[0] === 1 && r.seq[1] === 3 && r.seq[2] === 7, r.seq);
    ok('schedule: Easy > Good > Hard', r.easyPrev > r.goodPrev && r.goodPrev > r.hardPrev, r);
    ok('schedule: Forgot resets to tomorrow, counts a lapse, lowers ease', r.afterForgot.ivl === 1 && r.afterForgot.reps === 0 && r.afterForgot.lapses === 1 && r.afterForgot.ease < r.before && r.afterForgot.due === ymd(1), r.afterForgot);
    ok('schedule: priority-A chapters come back sooner than priority-C', r.a < r.c, r);
    ok('schedule: topics forgotten twice come back sooner', r.often < r.a, r);
    ok('schedule: gaps shrink so the topic is reviewed before its paper', r.near <= 5, r.near);
    await p.close();
  }

  /* 3. mastery needs proof of application */
  {
    const p = await open(b, state(), []);
    const r = await p.evaluate(() => {
      const e = newTopic({p: 'fr', cid: 'fr-4', topic: 'Leases'});
      e.reviews = [1, 2, 3, 4, 5, 6].map(i => ({d: iso(addDays(new Date(), -60 + i * 8)), r: 'good'})); e.ivl = 30; e.reps = 6;
      const reading = mastery(e);
      e.clicked = 'Lease liability is the PV of unpaid payments at commencement.'; e.apps = [{d: todayISO(), type: 'std', ok: true}, {d: todayISO(), type: 'new', ok: true}];
      const proved = mastery(e);
      e.reviews.push({d: todayISO(), r: 'forgot'}); const lapse = mastery(e);
      return {reading, proved, lapse};
    });
    ok('mastery: repeated good reviews alone do not make a topic mastered', r.reading.mastered === false && r.reading.need.includes('one question solved unaided'), r.reading);
    ok('mastery: solving questions (incl. unfamiliar) plus explanation reaches mastered', r.proved.mastered === true && r.proved.score >= 80, r.proved);
    ok('mastery: a fresh "forgot" removes mastered', r.lapse.mastered === false, r.lapse);
    const r2 = await p.evaluate(() => { S.mocks = [{id: 'm', paper: 'fr', date: todayISO(), score: 50, max: 100, mistakes: [{id: 'x', cid: 'fr-4', cat: 'concept', lost: 5}]}]; const e = newTopic({p: 'fr', cid: 'fr-4', topic: 'L', clicked: 'long enough explanation here.'}); return mastery(e).parts.concept });
    ok('mastery: recent conceptual mock mistakes in the chapter lower conceptual understanding', r2 === .6, r2);
    await p.close();
  }

  /* 4. review flow: four ratings, interval previews, application check */
  {
    const j = [{id: 'r1', p: 'fr', cid: 'fr-0', topic: 'Five steps', v: 2, ease: 2.3, ivl: 3, reps: 1, lapses: 0, apps: [], reviews: [{d: ymd(-3), r: 'good'}], due: ymd(0), created: ymd(-5), src: 'manual'}];
    const p = await open(b, state(), j);
    await p.click('button[data-act="jstart"]'); await p.click('button[data-act="jshow"]'); await p.waitForTimeout(60);
    const btns = await p.$$eval('button[data-act="jrate"]', x => x.map(e => e.textContent));
    ok('review: Forgot, Hard, Good and Easy each show the next gap', btns.length === 4 && btns[0].includes('tomorrow') && /\d/.test(btns[2]), btns);
    await p.click('button[data-act="jrate"][data-r="good"]'); await p.waitForTimeout(60);
    const ask = await p.evaluate(() => !!document.querySelector('button[data-act="japp"]'));
    ok('review: after Good, asks whether a question was solved', ask);
    await p.click('button[data-act="japp"][data-t="new"]'); await p.waitForTimeout(60);
    const e = await p.evaluate(() => J[0]);
    ok('review: rating and application recorded on the topic', e.reviews.length === 2 && e.apps.length === 1 && e.apps[0].type === 'new' && e.apps[0].ok && e.due > ymd(0), e);
    await p.close();
  }

  /* 5. suggestions */
  {
    const X = (id, cid, cat, lost) => ({id, cid, cat, lost, q: id});
    const st = state({ch: {'fr-6': {r: true, conf: 1, last: ymd(-5), hist: []}},
      mocks: [{id: 'a', paper: 'fr', num: 'M1', date: ymd(-20), score: 50, max: 100, mistakes: [X('x1', 'fr-4', 'calc', 5), X('x2', 'fr-3', 'concept', 6)]}, {id: 'b', paper: 'fr', num: 'M2', date: ymd(-5), score: 60, max: 100, mistakes: [X('x3', 'fr-4', 'calc', 4), X('x4', 'fr-1', 'formula', 2)]}]});
    const p = await open(b, st, []);
    const sg = await p.evaluate(() => tsSuggestions().map(x => x.src + '|' + (x.cid || '')));
    ok('suggestions: repeated mistake, costly mock mistake and low-confidence chapter found', sg.includes('repeated|fr-4') && sg.includes('mock|fr-3') && sg.includes('weak|fr-6'), sg);
    ok('suggestions: no duplicates of a repeated mistake, small mistakes skipped', !sg.includes('mock|fr-4') && !sg.includes('mock|fr-1'), sg);
    await p.click('button[data-act="sgdis"]'); await p.waitForTimeout(60);
    const after = await p.evaluate(() => ({n: tsSuggestions().length, d: Object.keys(S.tsDismiss).length}));
    ok('suggestions: dismiss hides it', after.n === 2 && after.d === 1, after);
    await p.click('button[data-act="sgall"]'); await p.waitForTimeout(60);
    const r = await p.evaluate(() => ({J: J.map(e => e.src + '|' + e.cid), left: tsSuggestions().length, tough: S.mocks[0].mistakes.find(x => x.id === 'x2').tough}));
    ok('suggestions: add all creates topics, marks mock mistakes, clears the list', r.J.length === 2 && r.left === 0 && r.tough === true, r);
    ok('suggestions: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 6. recall tests */
  {
    const p = await open(b, state({settings: {groups: '1'}}), []);
    const pool = await p.evaluate(() => ({all: RECALL.length, g1: recallPool('all').length, areas: [...new Set(recallPool('all').map(x => x.area))], ids: new Set(RECALL.map(x => x.id)).size}));
    ok('recall bank: 60+ cards with unique, content-based IDs', pool.all >= 60 && pool.ids === pool.all, pool);
    ok('recall: only cards for your active papers are used (Group I: no DT/GST)', pool.g1 < pool.all && !pool.areas.includes('Direct Tax') && !pool.areas.includes('GST & Customs'), pool.areas);
    await p.selectOption('#rcArea', 'Ind AS'); await p.waitForTimeout(40); await p.click('button[data-act="rcstart"]'); await p.waitForTimeout(60);
    const first = await p.evaluate(() => rt.items.map(x => x.area));
    ok('recall: test of 5 cards from the chosen area', first.length === 5 && first.every(a => a === 'Ind AS'), first);
    for (const g of ['right', 'partial', 'missed', 'right', 'missed']) { await p.click('button[data-act="rcshow"]'); await p.click(`button[data-act="rcg"][data-g="${g}"]`); await p.waitForTimeout(30) }
    const r = await p.evaluate(() => ({done: rt.done, log: S.recallLog[S.recallLog.length - 1], rec: Object.values(S.recall), J: J.filter(e => e.src === 'recall'), txt: document.body.textContent}));
    ok('recall: results saved per card and in history', r.done && r.log.n === 5 && r.log.right === 2 && r.log.partial === 1 && r.rec.length === 5, r.log);
    ok('recall: right cards scheduled later, missed ones tomorrow', r.rec.filter(x => x.due > ymd(1)).length === 2 && r.rec.filter(x => x.due === ymd(1)).length === 3, r.rec.map(x => x.due));
    ok('recall: missed cards become tough topics with the answer as their card, due today', r.J.length === 2 && r.J.every(e => e.card && e.card.questions.length === 1 && e.due === ymd(0) && e.kind === 'Recall failure'), r.J);
    ok('recall: summary lists missed cards', /Recall test finished/.test(r.txt) && /Missed/.test(r.txt));
    const again = await p.evaluate(() => { const x = RECALL.find(y => y.id === J.find(e => e.src === 'recall').rid); return {out: gradeRecall(x, 'missed'), n: J.filter(e => e.src === 'recall').length} });
    ok('recall: missing the same card again doesn\'t duplicate the topic', again.out === 'again' && again.n === 2, again);
    const off = await p.evaluate(() => { S.settings.autoRecall = false; const n = J.length; gradeRecall(RECALL.find(x => x.area === 'Definitions'), 'missed'); return J.length === n });
    ok('recall: auto-add can be switched off', off);
    ok('recall: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 7. Claude-written recall questions */
  {
    const p = await b.newPage({viewport: {width: 1280, height: 900}}); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(st => { localStorage.setItem('caFinalRankDesk.v1', JSON.stringify(st));
      const s = async () => ({text: ''}); s.json = async () => ({items: [{q: 'Q1?', a: 'A1'}, {q: 'Q2?', a: 'A2'}, {q: 'Q3?', a: 'A3'}]}); s.limits = async () => ({maxPromptBytes: 262144});
      window.claude = {use: async n => n === 'sample' ? s : n === 'db' ? {collection: c => ({doc: () => ({get: async () => ({exists: false}), set: async () => {}, onSnapshot: () => () => {}}), onSnapshot: f => { setTimeout(() => f({docs: [], docChanges: () => []}), 5); return () => {} }}), doc: () => ({onSnapshot: () => () => {}, get: async () => ({exists: false}), set: async () => {}})} : n === 'user' ? {id: async () => 'u', isOwner: async () => true, can: async () => true} : null};
    }, state());
    await p.goto(URL + '#journal'); await p.waitForTimeout(400);
    await p.selectOption('#rcCh', 'afm-0'); await p.click('button[data-act="rcai"]'); await p.waitForTimeout(200);
    const r = await p.evaluate(() => rt && {n: rt.items.length, ai: rt.items.every(x => x.ai && x.cid === 'afm-0'), area: rt.area});
    ok('recall: Claude writes questions for a chosen chapter and the test starts', r && r.n === 3 && r.ai && r.area === 'Claude', r);
    ok('recall (Claude): no errors', !errs.length, errs); await p.close();
  }

  /* 8. revision analytics */
  {
    const j = [
      {id: 'a', p: 'fr', cid: 'fr-0', topic: 'A', v: 2, ease: 2, ivl: 1, reps: 0, lapses: 3, apps: [], reviews: [{d: ymd(-1), r: 'forgot'}, {d: ymd(-9), r: 'good'}], due: ymd(-4), created: ymd(-20), src: 'manual'},
      {id: 'b', p: 'fr', cid: 'fr-16', topic: 'B', v: 2, ease: 2.5, ivl: 40, reps: 6, lapses: 0, apps: [{d: ymd(-2), type: 'std', ok: true}], reviews: [1, 2, 3, 4, 5].map(i => ({d: ymd(-i * 2), r: 'good'})), due: ymd(30), created: ymd(-60), src: 'manual', clicked: 'A long enough explanation of it.'}];
    const st = state({recallLog: [{id: 'l1', at: 1, d: ymd(0), area: 'all', n: 4, right: 3, partial: 1}]});
    const p = await open(b, st, j);
    const r = await p.evaluate(() => { const R = revisionStats(); return {R, mb: mastery(J.find(e => e.id === 'b'))} });
    ok('analytics: mastered, forgotten 2+ times and overdue counted', r.R.mastered === 1 && r.R.forgotten === 1 && r.R.overdue === 1, r.R);
    ok('analytics: reviews this week include recall cards', r.R.reviews7 === 5 + 4 - 1 + 1 || r.R.reviews7 >= 7, r.R.reviews7);
    ok('analytics: weekly accuracy combines reviews and recall tests', r.R.weeks[3].n >= 5 && r.R.weeks[3].pct > 0, r.R.weeks);
    ok('analytics: review-next puts the overdue, often-forgotten topic first', r.R.next[0].id === 'a', r.R.next.map(e => e.id));
    const txt = await p.textContent('#main');
    ok('analytics: tiles, weekly chart and review-next shown', /Forgotten 2\+ times/.test(txt) && /Recall accuracy by week/.test(txt) && /Review next/.test(txt));
    ok('analytics: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 9. phone layout with a recall test running */
  {
    const p = await open(b, state(), [], 'journal', {width: 390, height: 800});
    await p.click('button[data-act="rcstart"]'); await p.waitForTimeout(450);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('phone: Tough topics with a recall test has no sideways scroll or errors', over <= 0 && !p.errs.length, {over, e: p.errs}); await p.close();
  }

  await b.close();
  console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
