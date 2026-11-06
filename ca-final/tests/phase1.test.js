/* Phase 1 regression tests for CA Final Rank Desk.
   Run:  ./build.sh && node tests/phase1.test.js
   Needs Playwright with Chromium (require('playwright')). Uses an in-memory stand-in for the
   Claude page runtime (db, user, sample), so no network or account is needed. */
const {chromium} = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const results = []; let failed = 0;
function ok(name, cond, info) { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond || info === undefined ? '' : '  → ' + JSON.stringify(info))); if (!cond) failed++; }

/* fake runtime: shared in-memory db; options control failures and seeded docs */
function runtime(opts) {
  return ({opts}) => {
    const LS = 'caFinalRankDesk.v1';
    for (const [k, v] of Object.entries(opts.local || {})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    if (!opts.cloud) return;
    const store = Object.assign({}, opts.docs || {}); const docSubs = {}; const colSubs = {};
    window.__db = {store, failSet: opts.failSet || 0, sets: 0};
    const colOf = p => p.split('/').slice(0, -1).join('/');
    const fireDoc = p => (docSubs[p] || []).forEach(f => f({exists: !!store[p], data: () => store[p] && JSON.parse(JSON.stringify(store[p]))}));
    const fireCol = (c, changes) => (colSubs[c] || []).forEach(f => { const docs = Object.keys(store).filter(k => colOf(k) === c).map(k => ({id: k.split('/').pop(), data: () => JSON.parse(JSON.stringify(store[k]))})); f({docs, size: docs.length, empty: !docs.length, docChanges: () => changes || docs.map(d => ({type: 'added', doc: d}))}) });
    const doc = p => ({id: p.split('/').pop(), path: p,
      get: async () => ({exists: !!store[p], data: () => store[p] && JSON.parse(JSON.stringify(store[p]))}),
      set: async d => { if (window.__db.failSet > 0) { window.__db.failSet--; throw {code: opts.failCode || 'unavailable'} } window.__db.sets++; store[p] = JSON.parse(JSON.stringify(d)); fireDoc(p); fireCol(colOf(p), [{type: 'modified', doc: {id: p.split('/').pop(), data: () => JSON.parse(JSON.stringify(store[p]))}}]) },
      update: async d => { if (!store[p]) throw {code: 'invalid_argument'}; store[p] = Object.assign({}, store[p], JSON.parse(JSON.stringify(d))); fireDoc(p) },
      delete: async () => { delete store[p]; fireDoc(p) },
      onSnapshot: f => { (docSubs[p] = docSubs[p] || []).push(f); setTimeout(() => fireDoc(p), 5); return () => {} }});
    window.__fire = fireCol;
    const sample = async () => ({text: '[Page 1]\nQ1 answer text', truncated: false});
    sample.limits = async () => ({maxPromptBytes: 262144, images: {maxCount: 20, maxInputBytes: 5e6, mediaTypes: ['image/jpeg', 'image/png']}, modelTiers: ['default', 'quick']});
    sample.json = async (prompt, o) => { window.__tier = o.modelTier; return opts.evalResult };
    window.claude = {use: async n => n === 'db' ? {collection: c => ({doc: id => doc(c + '/' + id), onSnapshot: f => { (colSubs[c] = colSubs[c] || []).push(f); setTimeout(() => fireCol(c), 5); return () => {} }}), doc}
      : n === 'user' ? {id: async () => 'u_me', isOwner: async () => opts.owner !== false, can: async () => (opts.can === undefined ? null : opts.can), profiles: async ids => Object.fromEntries(ids.map(i => [i, {name: i}]))}
      : n === 'sample' ? sample : n === 'downloads' ? null : null};
  };
}
async function open(b, opts = {}, hash = 'today', vp = {width: 1200, height: 900}) {
  const p = await b.newPage({viewport: vp}); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) errs.push(m.text()) });
  p.on('dialog', d => d.dismiss());
  await p.addInitScript(runtime(opts), {opts});
  await p.goto(URL + '#' + hash); await p.waitForTimeout(opts.cloud ? 400 : 150);
  p.errs = errs; return p;
}
const iso = d => d.toISOString().slice(0, 10);
const today = new Date(); const ymd = n => { const d = new Date(today); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };

(async () => {
  const b = await chromium.launch();

  /* 1. v1 data upgrades to v2 without losing anything */
  {
    const v1 = {v: 1, updatedAt: 5, settings: {examDate: '2028-11-02', startDate: ymd(-30), groups: 'both', tWd: 2.5, tWe: 8, onBoard: true}, ch: {'fr-5': {r: true, conf: 2, last: ymd(-3), note: 'leases'}, 'audit-0': {r: true}}, log: {[ymd(-1)]: {fr: 2}}, mocks: [{id: 'a', paper: 'fr', date: ymd(-2), score: 55, max: 100}, {bad: 1}], checks: {el1: true}, todos: {}};
    const j1 = [{id: 'j1', p: 'fr', ch: 4, topic: 'Lessee ROU', kind: 'Concept', due: ymd(1), box: 0, reviews: []}];
    const p = await open(b, {local: {'caFinalRankDesk.v1': v1, 'caFinalRankDesk.v1.journal': j1}});
    const r = await p.evaluate(() => ({v: S.v, fr5: S.ch['fr-5'], mocks: S.mocks.length, exam: S.settings.examDates.fr, onBoard: S.settings.onBoard, cid: J[0].cid, rp: store.get(LS + '.restorePoint', null)}));
    ok('migration: upgraded to the current data version', r.v >= 4, r.v);
    ok('migration: chapter ticks, confidence, notes kept', r.fr5.r && r.fr5.conf === 2 && r.fr5.note === 'leases', r.fr5);
    ok('migration: revision history created from last date', Array.isArray(r.fr5.hist) && r.fr5.hist.length === 1);
    ok('migration: broken mock dropped, good one kept', r.mocks === 1, r.mocks);
    ok('migration: old single exam date converted', r.exam === '2028-11-02', r.exam);
    ok('migration: existing squad choice kept (Option B)', r.onBoard === true);
    ok('migration: tough topic linked by chapter ID', r.cid === 'fr-4', r.cid);
    ok('migration: restore point saved before upgrade', r.rp && /upgrade/.test(r.rp.reason) && r.rp.b.state.v === 1);
    ok('migration: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 2. new users are not on the squad board by default */
  { const p = await open(b); ok('opt-in: new user not on board', await p.evaluate(() => S.settings.onBoard === false)); await p.close(); }

  /* 3. timeline: blocks are contiguous, at least 1 day, and end exactly at the first paper */
  {
    const p = await open(b, {}, 'plan');
    const bad = await p.evaluate(() => {
      const out = []; const exam = examStart();
      for (const g of ['both', '1', '2']) for (const fr of [false, true]) for (const D of [1, 2, 3, 5, 6, 7, 10, 20, 30, 35, 60, 100, 109, 110, 111, 200, 400, 750]) {
        S.settings.groups = g; S.settings.frDone = fr; S.settings.startDate = iso(addDays(parse(exam), -D));
        const pl = buildPlan(); let cur = pl.start;
        if (!pl.valid) { out.push('invalid at ' + D); continue }
        for (const ph of pl.phases) { if (diffDays(cur, ph.start) !== 0) out.push(`${g}/${fr}/${D}: phase gap`); let c = ph.start;
          for (const bl of ph.blocks) { const len = diffDays(bl.start, bl.end); if (len < 1) out.push(`${g}/${fr}/${D}: ${bl.label} ${len}d`); if (diffDays(c, bl.start) !== 0) out.push(`${g}/${fr}/${D}: block gap`); c = bl.end }
          if (diffDays(c, ph.end) !== 0) out.push(`${g}/${fr}/${D}: blocks don't fill phase`); cur = ph.end }
        if (diffDays(cur, pl.exam) !== 0) out.push(`${g}/${fr}/${D}: ends ${diffDays(cur, pl.exam)}d off`);
      }
      S.settings.groups = 'both'; S.settings.startDate = examStart(); const inv = buildPlan(); if (inv.valid || !inv.issue) out.push('start=exam should be invalid');
      return out;
    });
    ok('timeline: no zero/negative blocks, no gaps, ends at first paper (108 combinations)', !bad.length, bad.slice(0, 5));
    const cliff = await p.evaluate(() => { const exam = examStart(); S.settings.frDone = false; S.settings.groups = 'both'; S.settings.startDate = todayISO();
      S.settings.examDates = defaultDates(iso(addDays(new Date(), 80))); const pl = buildPlan(); return {first: pl.phases[0].key, exp: expectedPct(pl), warn: !!pl.warn} });
    ok('timeline: 80-day plan keeps first reading and starts at 0% expected (no cliff)', cliff.first === 1 && cliff.exp < .02 && cliff.warn, cliff);
    await p.close();
  }

  /* 4. merge keeps both devices' changes and respects deletions */
  {
    const p = await open(b);
    const r = await p.evaluate(() => {
      const base = load({settings: {}, ch: {'fr-0': {r: true}}, log: {'2026-01-01': {fr: 1}}, mocks: [{id: 'm1', paper: 'fr', date: '2026-01-01', score: 50, max: 100}], todos: {'2026-01-01': [{t: 'x', done: false}]}, updatedAt: 1});
      const l = JSON.parse(JSON.stringify(base)); l.log['2026-01-02'] = {afm: 2}; l.ch['fr-1'] = {r: true}; l.updatedAt = 3;
      const rr = JSON.parse(JSON.stringify(base)); rr.mocks.push({id: 'm2', paper: 'dt', date: '2026-01-02', score: 60, max: 100}); delete rr.todos['2026-01-01']; rr.ch['fr-0'].conf = 4; rr.updatedAt = 2;
      const m = mergeState(base, l, rr);
      return {log: Object.keys(m.log).length, ch1: !!m.ch['fr-1'], conf: m.ch['fr-0'].conf, mocks: m.mocks.map(x => x.id).join(','), todo: !!m.todos['2026-01-01']};
    });
    ok('sync merge: local hours + chapter and remote mock + confidence all kept', r.log === 2 && r.ch1 && r.conf === 4 && r.mocks === 'm1,m2', r);
    ok('sync merge: deletion on the other device is respected', r.todo === false, r);
    await p.close();
  }

  /* 5. two devices: remote changes merged into local edits on load, and written back */
  {
    const base = {v: 2, updatedAt: 10, settings: {startDate: ymd(-20), onBoard: false}, ch: {}, log: {}, mocks: [], checks: {}, todos: {}};
    const remote = JSON.parse(JSON.stringify(base)); remote.mocks = [{id: 'r1', paper: 'fr', date: ymd(-1), score: 61, max: 100}]; remote.updatedAt = 20;
    const local = JSON.parse(JSON.stringify(base)); local.log = {[ymd(0)]: {audit: 3}}; local.updatedAt = 30;
    const p = await open(b, {cloud: true, local: {'caFinalRankDesk.v1': local, 'caFinalRankDesk.v1.base': base}, docs: {'data/users/u_me/state': {s: JSON.stringify(remote), t: 20}}});
    await p.waitForTimeout(1800);
    const r = await p.evaluate(() => { const c = JSON.parse(window.__db.store['data/users/u_me/state'].s); return {mocks: S.mocks.length, log: Object.keys(S.log).length, cm: c.mocks.length, cl: Object.keys(c.log).length} });
    ok('sync: offline edit on this device + change from other device both survive', r.mocks === 1 && r.log === 1 && r.cm === 1 && r.cl === 1, r);
    ok('sync: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 6. a failed cloud save is retried */
  {
    const p = await open(b, {cloud: true, failSet: 1});
    await p.evaluate(() => { S.checks.el1 = true; save() }); await p.waitForTimeout(1600);
    const mid = await p.evaluate(() => ({dirty, retry: !!retryT, txt: document.getElementById('syncText').textContent}));
    ok('sync retry: failure keeps changes queued and schedules a retry', mid.dirty && mid.retry && /retrying/.test(mid.txt), mid);
    await p.evaluate(() => { clearTimeout(retryT); retryT = null; return flush() }); await p.waitForTimeout(200);
    const end = await p.evaluate(() => ({dirty, saved: JSON.parse(window.__db.store['data/users/u_me/state'].s).checks.el1}));
    ok('sync retry: next attempt saves the change', !end.dirty && end.saved === true, end); await p.close();
  }

  /* 7. deletions don't come back from a stale device */
  {
    const p = await open(b, {cloud: true});
    const r = await p.evaluate(async () => {
      jPut({id: 'jx', p: 'fr', cid: 'fr-0', topic: 'T', kind: 'Concept', created: todayISO(), box: 0, due: todayISO(), reviews: [], mastered: false});
      await new Promise(r => setTimeout(r, 50)); const created = !!window.__db.store['data/users/u_me/state/journal/jx'];
      jRemove('jx'); await new Promise(r => setTimeout(r, 50));
      const marker = window.__db.store['data/users/u_me/state/journal/jx'];
      // stale device re-sends the old record
      window.__fire('data/users/u_me/state/journal', [{type: 'modified', doc: {id: 'jx', data: () => ({e: JSON.stringify({id: 'jx', p: 'fr', topic: 'T', u: 1}), u: 1})}}]);
      return {created, marker: marker && marker.deleted, back: J.some(e => e.id === 'jx')};
    });
    ok('tombstones: delete leaves a marker in the cloud', r.created && r.marker === true, r);
    ok('tombstones: stale copy is not brought back', r.back === false, r); await p.close();
  }

  /* 8. squad board data from others is sanitised (no script runs) */
  {
    const p = await open(b, {cloud: true, docs: {'board/u_evil': {pct: '<img src=x onerror="window.__pwned=1">', days: {[ymd(0)]: '<b>3</b>', '<x>': 5}, tWd: 'x', streak: '9<script>', lvl: 1e9}}}, 'squad');
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({pwned: window.__pwned || 0, row: board.find(x => x.id === 'u_evil')}));
    ok('squad: injected markup does not run', r.pwned === 0, r);
    ok('squad: values coerced to safe numbers', r.row.pct === null && Object.keys(r.row.days).length === 0 && r.row.lvl === 999, r.row); await p.close();
  }

  /* 9. evaluation marks reconcile */
  {
    const p = await open(b);
    const r = await p.evaluate(() => { const qs = [{q: '1', max: 10, awarded: 14}, {q: '2', max: 20, awarded: 12.3}, {q: '3', max: 0, awarded: 3}]; const a = evReconcile(qs, 100); const big = evReconcile([{max: 60, awarded: 60}, {max: 60, awarded: 50}], 100); return {aw: qs.map(q => q.awarded), total: a.total, note: a.note, bigTotal: big.total, bigNote: !!big.note} });
    ok('evaluate: question marks capped at their maximum', r.aw[0] === 10 && r.aw[1] === 12.5, r.aw);
    ok('evaluate: total equals sum of question marks', r.total === 25.5, r.total);
    ok('evaluate: flags missing questions and over-totals', /missing/.test(r.note) && r.bigTotal === 100 && r.bigNote, r); await p.close();
  }

  /* 10. evaluation end to end: capped marks and model tier fallback */
  {
    const png = path.join(os.tmpdir(), 'rank-desk-ans.png');
    const g = await b.newPage(); await g.setContent('<div style="font:24px serif;width:600px;height:800px;background:#fff">Q1 answer</div>'); await g.screenshot({path: png}); await g.close();
    const p = await open(b, {cloud: true, evalResult: {total: 95, summary: 's', confidence: 'medium', questions: [{q: '1', max: 50, awarded: 70, status: 'full'}, {q: '2', max: 50, awarded: 20, status: 'partial', missed: ['x']}], strengths: [], improvements: []}}, 'evaluate');
    await p.fill('#evQPT', 'Q1 (50 marks) Q2 (50 marks)'); await p.dispatchEvent('#evQPT', 'change');
    await p.setInputFiles('#evAns', png); await p.waitForTimeout(100);
    await p.click('button[data-act="evrun"]'); await p.waitForSelector('button[data-act="evmock"]', {timeout: 15000}).catch(() => {});
    const r = await p.evaluate(() => ({ev: EV[0] && EV[0].result.total, tier: window.__tier, tr: EV[0] && EV[0].transcript, cloud: Object.keys(window.__db.store).find(k => k.includes('/evals/'))}));
    ok('evaluate: total uses capped question marks (50 + 20)', r.ev === 70, r);
    ok('evaluate: falls back to an available model tier', r.tier === 'default', r.tier);
    ok('evaluate: transcript saved to the cloud separately', r.cloud && typeof (await p.evaluate(k => window.__db.store[k].tr, r.cloud)) === 'string');
    const local = await p.evaluate(() => store.get(EK, []));
    ok('evaluate: device copy leaves out the transcript', local.length === 1 && local[0].transcript === undefined);
    await p.click('button[data-act="evmock"]'); await p.waitForTimeout(100);
    ok('evaluate: saving to Mocks keeps the cloud transcript', typeof (await p.evaluate(k => window.__db.store[k].tr, r.cloud)) === 'string' && await p.evaluate(() => S.mocks.length === 1));
    ok('evaluate: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 11. timer splits across midnight; a day never exceeds 24 hours */
  {
    const p = await open(b);
    const r = await p.evaluate(() => { const a = new Date(2026, 0, 1, 23, 0).getTime(), z = new Date(2026, 0, 2, 1, 30).getTime(); const parts = splitSession(a, z);
      S.log = {}; addHours('2026-01-05', 'fr', 20); const capped = addHours('2026-01-05', 'afm', 10); return {parts, day: hoursOn('2026-01-05'), capped} });
    ok('timer: session across midnight split by day', Math.abs(r.parts['2026-01-01'] - 1) < 1e-9 && Math.abs(r.parts['2026-01-02'] - 1.5) < 1e-9, r.parts);
    ok('hours: day capped at 24 and reported', r.day === 24 && r.capped, r); await p.close();
  }

  /* 12. revision stages stay consistent; confidence doesn't count as a revision */
  {
    const st = {v: 2, updatedAt: 1, settings: {startDate: ymd(-10)}, ch: {'fr-0': {conf: 1, last: ymd(-30), hist: []}}, log: {}, mocks: [], checks: {}, todos: {}};
    const p = await open(b, {local: {'caFinalRankDesk.v1': st}}, 'syllabus');
    await p.click('button[data-act="conf"][data-k="fr-0"][data-n="3"]');
    const last1 = await p.evaluate(() => S.ch['fr-0'].last);
    await p.click('input[data-act="stage"][data-k="fr-0"][data-s="r2"]');
    const a = await p.evaluate(() => S.ch['fr-0']);
    await p.click('input[data-act="stage"][data-k="fr-0"][data-s="r1"]');
    const c = await p.evaluate(() => S.ch['fr-0']);
    ok('revision: confidence change leaves the revision date alone', last1 === st.ch['fr-0'].last, last1);
    ok('revision: ticking Rev 2 fills Read and Rev 1, records history', a.r && a.r1 && a.r2 && a.last === ymd(0) && a.hist.length === 1, a);
    ok('revision: unticking Rev 1 clears Rev 2', !c.r1 && !c.r2 && c.r, c); await p.close();
  }

  /* 13. backup: complete, validated, restorable; v1 backups accepted */
  {
    const p = await open(b, {cloud: true});
    const r = await p.evaluate(() => {
      S.mocks = [{id: 'mm', paper: 'fr', date: todayISO(), score: 50, max: 100}]; S.log[todayISO()] = {fr: 2}; S.ch['fr-1'] = {r: true, hist: []}; save();
      jPut({id: 'jb', p: 'fr', cid: 'fr-1', topic: 'B', kind: 'Concept', created: todayISO(), box: 2, due: todayISO(), reviews: [{d: todayISO(), r: 'good'}], mastered: false});
      evPut({id: 'eb', created: 1, paper: 'fr', name: 'M', date: todayISO(), max: 100, result: {total: 50, questions: [{q: '1', max: 100, awarded: 50}]}, transcript: 'T'});
      const txt = JSON.stringify(makeBackup(true)); const back = readBackup(txt); const c = backupCounts(back);
      let bad = ''; try { readBackup('{"hello":1}') } catch (e) { bad = e.message }
      let junk = ''; try { readBackup('not json') } catch (e) { junk = e.message }
      const v1 = readBackup(JSON.stringify({settings: {startDate: '2026-01-01'}, ch: {'fr-2': {r: true}}, journal: [{id: 'old', p: 'fr', ch: 2, topic: 'X'}]}));
      return {c, tr: back.evals[0].transcript, rev: back.journal[0].reviews.length, bad, junk, v1ch: v1.state.ch['fr-2'].r, v1cid: v1.journal[0].cid};
    });
    ok('backup: includes progress, hours, mocks, topics, evaluations', r.c.chapters === 1 && r.c.days === 1 && r.c.mocks === 1 && r.c.topics === 1 && r.c.evals === 1, r.c);
    ok('backup: includes transcripts and review history', r.tr === 'T' && r.rev === 1, r);
    ok('backup: rejects text that is not a backup, with a clear message', /doesn't look like/.test(r.bad) && /isn't backup text/.test(r.junk), r);
    ok('backup: old (v1) backups still restore', r.v1ch === true && r.v1cid === 'fr-2', r);
    // restore through the UI, then undo
    const bkTxt = await p.evaluate(() => JSON.stringify(makeBackup(true)));
    await p.evaluate(() => { S.mocks = []; save(); location.hash = 'setup' }); await p.waitForTimeout(200);
    await p.fill('#bkText', bkTxt); await p.click('button[data-act="bkcheck"]'); await p.waitForTimeout(100);
    const preview = await p.textContent('.confirm');
    await p.click('button[data-act="bkapply"]'); await p.waitForTimeout(100);
    const restored = await p.evaluate(() => S.mocks.length);
    await p.click('button[data-act="undoask"]'); await p.click('button[data-act="undoyes"]'); await p.waitForTimeout(100);
    const undone = await p.evaluate(() => S.mocks.length);
    ok('restore: preview shows counts and asks to confirm', /1 mocks/.test(preview) && /restore point/.test(preview), preview.slice(0, 120));
    ok('restore: backup applied, and undo returns to the previous state', restored === 1 && undone === 0, {restored, undone});
    ok('backup/restore: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 14. selective reset with confirmation and undo */
  {
    const st = {v: 2, updatedAt: 1, settings: {startDate: ymd(-10)}, ch: {'fr-0': {r: true, hist: []}}, log: {[ymd(-1)]: {fr: 3}}, mocks: [{id: 'x', paper: 'fr', date: ymd(-1), score: 40, max: 100}], checks: {el1: true}, todos: {}};
    const p = await open(b, {local: {'caFinalRankDesk.v1': st}}, 'setup');
    await p.click('input[data-act="rspart"][data-k="mocks"]'); await p.click('button[data-act="rsask"]');
    const beforeConfirm = await p.evaluate(() => S.mocks.length);
    await p.click('button[data-act="rsyes"]'); await p.waitForTimeout(100);
    const r = await p.evaluate(() => ({mocks: S.mocks.length, log: Object.keys(S.log).length, ch: !!S.ch['fr-0'], checks: !!S.checks.el1}));
    ok('reset: nothing erased before confirming', beforeConfirm === 1);
    ok('reset: only mocks erased', r.mocks === 0 && r.log === 1 && r.ch && r.checks, r);
    await p.click('button[data-act="undoask"]'); await p.click('button[data-act="undoyes"]'); await p.waitForTimeout(100);
    ok('reset: undo brings mocks back', await p.evaluate(() => S.mocks.length === 1)); await p.close();
  }

  /* 15. mocks: edit, no 100-mark cap, no future dates */
  {
    const p = await open(b, {}, 'mocks');
    await p.fill('#mScore', '150'); await p.fill('#mMax', '200'); await p.click('#mockForm button.primary'); await p.waitForTimeout(100);
    const added = await p.evaluate(() => S.mocks[0] && S.mocks[0].score);
    await p.click('button[data-act="editmock"]'); await p.fill('#mScore', '160'); await p.click('#mockForm button.primary'); await p.waitForTimeout(100);
    const edited = await p.evaluate(() => ({n: S.mocks.length, s: S.mocks[0].score}));
    ok('mocks: marks above 100 allowed when out of 200', added === 150, added);
    ok('mocks: editing updates in place', edited.n === 1 && edited.s === 160, edited); await p.close();
  }

  /* 16. every tab renders without errors on desktop and phone */
  for (const vp of [{width: 1200, height: 900}, {width: 390, height: 800}]) {
    const p = await open(b, {}, 'today', vp); const over = [];
    for (const v of ['today', 'syllabus', 'journal', 'plan', 'mocks', 'evaluate', 'hours', 'squad', 'playbook', 'checklists', 'setup']) {
      await p.evaluate(v => location.hash = v, v); await p.waitForTimeout(450);
      const w = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (w > 0) over.push(v + ':' + w);
    }
    ok(`smoke ${vp.width}px: all tabs render with no errors`, !p.errs.length, p.errs);
    ok(`smoke ${vp.width}px: no sideways page scroll`, !over.length, over); await p.close();
  }

  /* 17. view-only friend (access known up front): no endless retries, clear guidance, board blocked */
  {
    const p = await open(b, {cloud: true, owner: false, can: false}, 'squad');
    await p.evaluate(() => { S.checks.el1 = true; save() }); await p.waitForTimeout(1600);
    const r = await p.evaluate(() => ({cw: canWrite, retry: !!retryT, sets: window.__db.sets, sync: document.getElementById('syncText').textContent, notice: document.getElementById('notice').textContent, card: document.body.textContent.includes("You can't join the board yet"), boxDisabled: document.querySelector('input[data-act="board"]').disabled, local: store.get(LS, {}).checks.el1}));
    ok('view-only: detected before any save, nothing sent', r.cw === false && r.sets === 0 && !r.retry, r);
    ok('view-only: says progress is kept on this phone and to ask for Editor access', /this phone/.test(r.notice) && /Editor/.test(r.notice) && /device only/.test(r.sync), r);
    ok('view-only: squad explains the fix and the board box is disabled', r.card && r.boxDisabled, r);
    ok('view-only: progress still saved on the device', r.local === true, r);
    ok('view-only: no errors', !p.errs.length, p.errs); await p.close();
  }
  /* 18. access unknown up front, first save refused: stops retrying instead of looping */
  {
    const p = await open(b, {cloud: true, owner: false, failSet: 99, failCode: 'invalid_argument'}, 'squad');
    await p.click('input[data-act="board"]'); await p.waitForTimeout(1800);
    const r = await p.evaluate(() => ({cw: canWrite, retry: !!retryT, dirty, sync: document.getElementById('syncText').textContent, onBoardBox: document.querySelector('input[data-act="board"]').checked}));
    ok('refused save: stops retrying and switches to device-only saving', r.cw === false && !r.retry && !r.dirty && /device only/.test(r.sync), r);
    ok('refused save: board box shown unticked and disabled', r.onBoardBox === false, r); await p.close();
  }
  /* 19. temporary outage still retries */
  {
    const p = await open(b, {cloud: true, failSet: 1, failCode: 'unavailable'});
    await p.evaluate(() => { S.checks.el2 = true; save() }); await p.waitForTimeout(1600);
    ok('outage: temporary failure still schedules a retry', await p.evaluate(() => !!retryT && canWrite !== false)); await p.close();
  }

  await b.close();
  console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
