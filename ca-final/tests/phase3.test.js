/* Phase 3 tests: daily planner, carry-over, completion effects, focus timer and sessions.
   Run:  ./build.sh && node tests/phase3.test.js   (needs Playwright with Chromium) */
const {chromium} = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const results = []; let failed = 0;
const ok = (name, cond, info) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond || info === undefined ? '' : '  → ' + JSON.stringify(info))); if (!cond) failed++; };
const ymd = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
const EX = {fr: '2028-11-02', afm: '2028-11-04', audit: '2028-11-06', dt: '2028-11-08', idt: '2028-11-10', ibs: '2028-11-12'};
const state = (o = {}) => Object.assign({v: 3, updatedAt: 5, ch: {}, log: {}, mocks: [], checks: {}, todos: {}, plan: {}, sessions: []}, o,
  {settings: Object.assign({startDate: ymd(-20), groups: 'both', tWd: 2.5, tWe: 2.5, revDays: 21, targetPct: 80, examDates: EX}, o.settings || {})});
const task = (o) => Object.assign({id: 'x' + Math.random().toString(36).slice(2, 7), kind: 'Revise', paper: 'fr', cid: 'fr-0', t: 'Revise X', mins: 60, full: 60, part: false, score: 80, level: 'High', why: 'w', gain: 'g', status: 'todo', doneMins: 0}, o);
async function open(b, st, hash = 'today', vp = {width: 1280, height: 900}) {
  const p = await b.newPage({viewport: vp}); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(st => { if (st) localStorage.setItem('caFinalRankDesk.v1', JSON.stringify(st)) }, st);
  await p.goto(URL + '#' + hash); await p.waitForTimeout(200); p.errs = errs; return p;
}

(async () => {
  const b = await chromium.launch();

  /* 1. v2 data upgrades to v3 */
  {
    const v2 = {v: 2, updatedAt: 5, settings: {startDate: ymd(-5)}, ch: {'fr-0': {r: true, hist: []}}, log: {}, mocks: [], checks: {}, todos: {}};
    const p = await open(b, v2);
    const r = await p.evaluate(() => ({v: S.v, plan: isObj(S.plan), sessions: Array.isArray(S.sessions), kept: S.ch['fr-0'].r, rp: !!store.get(LS + '.restorePoint', null)}));
    ok('migration v3: adds plans and sessions, keeps progress, saves a restore point', r.v >= 3 && r.plan && r.sessions && r.kept && r.rp, r);
    await p.close();
  }

  /* 2. plan is created for today, fills the target, and isn't saved until you act on it */
  {
    const p = await open(b, state({ch: {'fr-0': {r: true, conf: 2, last: ymd(-30), hist: []}}}));
    const r = await p.evaluate(() => { const pl = S.plan[todayISO()]; return {n: pl.tasks.length, mins: pl.tasks.reduce((a, x) => a + x.mins, 0), target: pl.target, savedLocal: !!(store.get(LS, {}).plan || {})[todayISO()], ids: pl.tasks.map(x => x.id)} });
    ok('plan: created on Today and adds up to the target', r.n >= 1 && r.mins === r.target && r.target === 150, r);
    ok('plan: not written to storage before you act on it', r.savedLocal === false, r);
    await p.evaluate(() => location.hash = 'syllabus'); await p.waitForTimeout(100); await p.evaluate(() => location.hash = 'today'); await p.waitForTimeout(100);
    const same = await p.evaluate(ids => S.plan[todayISO()].tasks.map(x => x.id).join() === ids.join(), r.ids);
    ok('plan: stays the same when you come back to Today', same);
    await p.click('button[data-act="ptskip"]'); await p.waitForTimeout(100);
    ok('plan: saved once you act on a task', await p.evaluate(() => !!(store.get(LS, {}).plan || {})[todayISO()]));
    ok('plan: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 3. Done updates Syllabus */
  {
    const t = ymd(0);
    const st = state({ch: {'fr-1': {r: true, r1: true, hist: [], last: ymd(-30)}, 'fr-2': {r: true, hist: [], last: ymd(-2)}}, plan: {[t]: {created: 1, target: 150, tasks: [
      task({id: 'L', kind: 'Learn', cid: 'fr-0', t: 'Read A'}), task({id: 'LP', kind: 'Learn', cid: 'fr-3', t: 'Read B', part: true, mins: 30, full: 120}),
      task({id: 'R', kind: 'Revise', cid: 'fr-1'}), task({id: 'Q', kind: 'Practise', cid: 'fr-2', t: 'Solve'})]}}});
    const p = await open(b, st);
    for (const id of ['L', 'LP', 'R', 'Q']) { await p.click(`button[data-act="ptdone"][data-id="${id}"]`); await p.waitForTimeout(60) }
    const r = await p.evaluate(() => ({L: S.ch['fr-0'] && S.ch['fr-0'].r, LP: !!(S.ch['fr-3'] && S.ch['fr-3'].r), R: S.ch['fr-1'], Q: S.ch['fr-2'].q, st: S.plan[todayISO()].tasks.map(x => x.status)}));
    ok('done: Learn ticks Read', r.L === true, r);
    ok('done: a partial Learn session does not tick Read', r.LP === false, r);
    ok('done: Revise records the next revision stage and date', r.R.r2 === true && r.R.last === ymd(0), r.R);
    ok('done: Practise ticks Questions', r.Q === true, r);
    ok('done: tasks marked done', r.st.every(x => x === 'done'), r.st);
    await p.click('button[data-act="ptreopen"][data-id="L"]'); await p.waitForTimeout(60);
    ok('reopen: task back to open, Syllabus tick kept', await p.evaluate(() => S.plan[todayISO()].tasks.find(x => x.id === 'L').status === 'todo' && S.ch['fr-0'].r === true));
    await p.close();
  }

  /* 4. carry-over: unfinished relevant work moves forward; stale work is dropped */
  {
    const y = ymd(-1);
    const st = state({ch: {'fr-0': {r: true, last: ymd(-30), hist: []}, 'fr-1': {r: true, last: ymd(0), hist: []}, 'audit-0': {r: true, hist: []}},
      plan: {[y]: {created: 1, target: 150, tasks: [
        task({id: 'a', kind: 'Revise', cid: 'fr-0', t: 'Revise Ind AS 115'}),                // not revised since: carry
        task({id: 'b', kind: 'Revise', cid: 'fr-1', t: 'Revise Ind AS 109'}),                // revised today: drop
        task({id: 'c', kind: 'Learn', paper: 'audit', cid: 'audit-0', t: 'Read QM'}),         // read since: drop
        task({id: 'd', kind: 'Learn', paper: 'audit', cid: 'audit-1', t: 'Read GAP', status: 'skipped'}), // skipped: drop
        task({id: 'e', kind: 'Learn', paper: 'audit', cid: 'audit-2', t: 'Read Planning', part: true, mins: 30, full: 120, status: 'done'})]}}}); // partial done: continue 90
    const p = await open(b, st);
    const r = await p.evaluate(() => { const T = S.plan[todayISO()].tasks; return {T: T.map(x => [x.kind, x.cid, x.mins, x.carry, x.from].join('|')), src: S.plan[iso(addDays(new Date(), -1))].tasks.map(x => x.id + ':' + !!x.carried)} });
    ok('carry: unfinished revision not done since is carried', r.T.some(x => x.startsWith('Revise|fr-0|60|true|' + y)), r);
    ok('carry: work already done another way is dropped (revised / read)', !r.T.some(x => /\|fr-1\|/.test(x) && x.includes('|true|')) && !r.T.some(x => /\|audit-0\|/.test(x)), r);
    ok('carry: skipped tasks are not carried', !r.T.some(x => /\|audit-1\|/.test(x) && x.includes('|true|')), r);
    ok('carry: a partial reading session continues with the remaining time', r.T.some(x => x.startsWith('Learn|audit-2|90|true')), r);
    ok('carry: carried source tasks are marked so they never carry twice', r.src.includes('a:true') && r.src.includes('e:true'), r.src);
    const title = await p.textContent('.pri:has(button[data-act="ptstart"])');
    ok('carry: shown with its origin date and reason', /from /.test(title) && /Carried over from/.test(await p.textContent('#main')), title.slice(0, 80));
    await p.close();
  }

  /* 5. backlog limits: carried work capped at half a day; tasks over 14 days expire */
  {
    const tasks = []; for (let i = 0; i < 8; i++) tasks.push(task({id: 'r' + i, kind: 'Revise', cid: 'fr-' + i, t: 'Revise ' + i, mins: 45}));
    const ch = {}; for (let i = 0; i < 8; i++) ch['fr-' + i] = {r: true, last: ymd(-40), hist: []};
    const st = state({ch, settings: {startDate: ymd(-40)}, plan: {[ymd(-2)]: {created: 1, target: 150, tasks}, [ymd(-20)]: {created: 1, target: 150, tasks: [task({id: 'old', kind: 'Revise', cid: 'afm-0', t: 'Old'})]}}});
    st.ch['afm-0'] = {r: true, last: ymd(-40), hist: []};
    const p = await open(b, st);
    const r = await p.evaluate(() => { const pl = S.plan[todayISO()]; const carried = pl.tasks.filter(x => x.carry); return {carriedMins: carried.reduce((a, x) => a + x.mins, 0), total: pl.tasks.reduce((a, x) => a + x.mins, 0), expired: pl.expired, bl: backlogInfo(), oldIn: pl.tasks.some(x => x.carry && x.cid === 'afm-0')} });
    ok('backlog: carried work takes at most half the day', r.carriedMins <= 75 && r.total === 150, r);
    ok('backlog: the rest waits and is reported', r.bl.n >= 5, r.bl);
    ok('backlog: tasks older than 14 days expire instead of carrying', r.expired === 1 && !r.oldIn, r);
    const W = await p.evaluate(() => warnings().map(w => w.t));
    ok('backlog: a warning appears when waiting work exceeds a day', W.some(t => /of unfinished work is waiting/.test(t)), W);
    await p.close();
  }

  /* 6. Tomorrow and rebuild */
  {
    const p = await open(b, state({ch: {'fr-0': {r: true, conf: 1, last: ymd(-30), hist: []}, 'fr-1': {r: true, conf: 1, last: ymd(-30), hist: []}}}));
    const ids = await p.evaluate(() => S.plan[todayISO()].tasks.map(x => x.id));
    await p.click(`button[data-act="ptdefer"][data-id="${ids[0]}"]`); await p.click(`button[data-act="ptdone"][data-id="${ids[1]}"]`).catch(() => {}); await p.waitForTimeout(60);
    await p.click('button[data-act="ptrebuild"]'); await p.waitForTimeout(100);
    const r = await p.evaluate(ids => { const T = S.plan[todayISO()].tasks; return {kept: T.filter(x => ids.includes(x.id)).map(x => x.status), total: T.filter(x => x.status !== 'deferred' && x.status !== 'skipped').reduce((a, x) => a + x.mins, 0), target: S.plan[todayISO()].target} }, ids);
    ok('rebuild: keeps tasks you acted on', r.kept.includes('deferred'), r);
    ok('rebuild: refills the rest of the target', r.total <= r.target && r.total >= r.target - 20, r);
    await p.close();
  }

  /* 7. focus timer: chapter, planned time, session history, task progress */
  {
    const p = await open(b, state({ch: {'fr-0': {r: true, conf: 1, last: ymd(-30), hist: []}}}));
    await p.selectOption('#tPaper', 'audit'); await p.waitForTimeout(50);
    const opts = await p.$$eval('#tCh option', o => o.map(x => x.value));
    ok('timer: chapter list follows the chosen paper', opts[1] === 'audit-0', opts.slice(0, 3));
    await p.selectOption('#tCh', 'audit-3'); await p.selectOption('#tPlan', '90');
    await p.click('button[data-act="tstart"]'); await p.waitForTimeout(80);
    const run = await p.evaluate(() => ({t: timer, label: document.querySelector('.label').parentElement && document.body.textContent.includes('of 1 h 30 min planned')}));
    ok('timer: starts with chapter and planned time', run.t.cid === 'audit-3' && run.t.planned === 90 && run.label, run);
    await p.evaluate(() => { timer.start -= 30 * 60000; store.set(TK, timer); render() }); await p.click('button[data-act="tstop"]'); await p.waitForTimeout(80);
    const s1 = await p.evaluate(() => ({s: S.sessions[S.sessions.length - 1], h: hoursOn(todayISO())}));
    ok('timer: session saved with paper, chapter, planned and actual minutes', s1.s.p === 'audit' && s1.s.cid === 'audit-3' && s1.s.planned === 90 && s1.s.mins === 30 && Math.abs(s1.h - 0.5) < 0.01, s1);
    const tid = await p.evaluate(() => S.plan[todayISO()].tasks.find(x => x.status === 'todo').id);
    await p.click(`button[data-act="ptstart"][data-id="${tid}"]`); await p.waitForTimeout(60);
    await p.evaluate(() => { timer.start -= 20 * 60000; store.set(TK, timer); render() }); await p.click('button[data-act="tstop"]'); await p.waitForTimeout(80);
    const s2 = await p.evaluate(id => ({task: S.plan[todayISO()].tasks.find(x => x.id === id), s: S.sessions[S.sessions.length - 1]}), tid);
    ok('timer: Start on a task links the session and records progress on the task', s2.s.taskId === tid && s2.task.doneMins === 20 && s2.s.planned === s2.task.mins, s2);
    await p.evaluate(() => location.hash = 'hours'); await p.waitForTimeout(450);
    const hrs = await p.textContent('#main');
    ok('hours: focus session history and summary shown', /Focus sessions/.test(hrs) && /2 sessions/.test(hrs) && /Planned/.test(hrs), hrs.slice(0, 60));
    ok('timer/sessions: no errors', !p.errs.length, p.errs); await p.close();
  }

  /* 8. sessions merge across devices; backup and reset include plans and sessions */
  {
    const p = await open(b, state());
    const r = await p.evaluate(() => {
      const base = load({settings: {}, sessions: [{id: 's1', p: 'fr', start: 1, mins: 10}], plan: {}, updatedAt: 1});
      const l = JSON.parse(JSON.stringify(base)); l.sessions.push({id: 's2', p: 'fr', start: 2, mins: 20}); l.updatedAt = 3;
      const rr = JSON.parse(JSON.stringify(base)); rr.sessions.push({id: 's3', p: 'dt', start: 3, mins: 30}); rr.updatedAt = 2;
      const m = mergeState(base, l, rr);
      S.sessions = [{id: 'sx', p: 'fr', start: Date.now(), mins: 5}]; ensurePlan(); save();
      const bk = readBackup(JSON.stringify(makeBackup(false)));
      applyReset(['tasks', 'hours']);
      return {merged: m.sessions.map(x => x.id).join(), bkS: bk.state.sessions.length, bkP: Object.keys(bk.state.plan).length, afterS: S.sessions.length, afterP: Object.keys(S.plan).length};
    });
    ok('sync: focus sessions from both devices are kept', r.merged === 's1,s2,s3', r);
    ok('backup: includes plans and sessions', r.bkS === 1 && r.bkP === 1, r);
    ok('reset: plans and sessions erased with their parts', r.afterS === 0 && r.afterP <= 1, r);
    await p.close();
  }

  /* 9. smoke on phone and desktop */
  for (const vp of [{width: 1280, height: 900}, {width: 390, height: 800}]) {
    const p = await open(b, state({ch: {'fr-0': {r: true, conf: 1, last: ymd(-30), hist: []}}}), 'today', vp); const over = [];
    for (const v of ['today', 'hours', 'setup']) { await p.evaluate(v => location.hash = v, v); await p.waitForTimeout(450); const w = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (w > 0) over.push(v + ':' + w) }
    ok(`smoke ${vp.width}px: planner, timer and sessions render without errors or sideways scroll`, !p.errs.length && !over.length, {e: p.errs, over}); await p.close();
  }

  await b.close();
  console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
