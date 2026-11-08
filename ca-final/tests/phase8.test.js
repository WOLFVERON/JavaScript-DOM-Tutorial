/* Phase 8: final integration and quality checks.
   The full preparation loop end to end, settings-driven plan rebuild, upgrade from the original data format,
   empty states, accessibility (names, current tab, keyboard focus, contrast in light and dark), layout and speed.
   Run:  ./build.sh && node tests/phase8.test.js   (needs Playwright with Chromium) */
const {chromium} = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const results = []; let failed = 0;
const ok = (name, cond, info) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond || info === undefined ? '' : '  → ' + JSON.stringify(info))); if (!cond) failed++; };
const ymd = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
const EX = {fr: '2027-05-02', afm: '2027-05-04', audit: '2027-05-06', dt: '2027-05-08', idt: '2027-05-10', ibs: '2027-05-12'};
const TABS = ['today', 'syllabus', 'journal', 'plan', 'mocks', 'evaluate', 'analytics', 'hours', 'squad', 'playbook', 'checklists', 'setup'];
const base = (o = {}) => Object.assign({v: 5, updatedAt: 5, ch: {}, log: {}, mocks: [], checks: {}, todos: {}, plan: {}, sessions: [], recall: {}, recallLog: [], tsDismiss: {}}, o,
  {settings: Object.assign({startDate: ymd(-10), groups: '1', tWd: 2.5, tWe: 2.5, revDays: 21, targetPct: 80, examDates: EX}, o.settings || {})});
async function open(b, local, hash = 'today', ctxOpts = {}) {
  const ctx = await b.newContext(Object.assign({viewport: {width: 1280, height: 900}}, ctxOpts)); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(local => { for (const [k, v] of Object.entries(local || {})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)) }, local);
  await p.goto(URL + '#' + hash); await p.waitForTimeout(300); p.errs = errs; p.ctx = ctx; return p;
}
const LS = 'caFinalRankDesk.v1';

(async () => {
  const b = await chromium.launch();

  /* 1. the preparation loop, end to end */
  {
    const p = await open(b, {[LS]: base()});
    // Learn: plan suggests reading; Done ticks Read
    const learn = await p.evaluate(() => S.plan[todayISO()].tasks.find(x => x.kind === 'Learn'));
    await p.click(`button[data-act="ptdone"][data-id="${learn.id}"]`); await p.waitForTimeout(60);
    ok('loop 1 Learn: finishing a plan reading task marks the chapter read', await p.evaluate(cid => S.ch[cid].r === true, learn.cid), learn);
    // Practise: tick Questions in Syllabus
    const cid = learn.cid, pid = cid.split('-')[0];
    await p.evaluate(() => location.hash = 'syllabus'); await p.waitForTimeout(450);
    await p.click(`button[data-act="paper"][data-p="${pid}"]`); await p.click(`input[data-act="stage"][data-k="${cid}"][data-s="q"]`); await p.waitForTimeout(60);
    ok('loop 2 Practise: questions ticked feed readiness', await p.evaluate(pid => paperReadiness(pid).comp.practice > 0, pid));
    // Mock: two mocks with a mistake on that chapter
    const r = await p.evaluate(({cid, pid}) => {
      S.mocks.push({id: 'm1', paper: pid, date: iso(addDays(new Date(), -9)), score: 50, max: 100, mistakes: [{id: 'a', q: '1', cid, cat: 'concept', lost: 6}]});
      S.mocks.push({id: 'm2', paper: pid, date: iso(addDays(new Date(), -2)), score: 56, max: 100, mistakes: [{id: 'b', q: '2', cid, cat: 'concept', lost: 5}]});
      S.ch[cid].last = iso(addDays(new Date(), -5)); save();
      return {sugg: tsSuggestions().map(s => s.src + ':' + s.cid), cand: priorities().list.concat([]).map(x => x.kind + ':' + x.cid + ':' + x.why)};
    }, {cid, pid});
    ok('loop 4→6 Mock → Mistakes: a repeated mistake is suggested as a tough topic', r.sugg.includes('repeated:' + cid), r.sugg);
    const why = await p.evaluate(cid => { const pl = priorities({target: 600}); const x = pl.list.find(t => t.kind === 'Revise' && t.cid === cid); return x && x.why }, cid);
    ok('loop: chapters losing mock marks get revision priority in the planner (even if revised recently)', !!why && /11 marks lost/.test(why), why);
    // Correct: accept suggestion, review it
    await p.evaluate(() => location.hash = 'journal'); await p.waitForTimeout(450);
    await p.click('button[data-act="sgadd"]'); await p.waitForTimeout(60);
    const topic = await p.evaluate(() => J[0]);
    await p.evaluate(id => { const e = J.find(x => x.id === id); e.due = todayISO(); jPut(e); render() }, topic.id);
    await p.click('button[data-act="jstart"]'); await p.click('button[data-act="jshow"]'); await p.click('button[data-act="jrate"][data-r="good"]'); await p.waitForTimeout(60);
    if (await p.$('button[data-act="japp"]')) await p.click('button[data-act="japp"][data-t="std"]');
    ok('loop 7 Correct: the topic is reviewed and rescheduled', await p.evaluate(id => { const e = J.find(x => x.id === id); return e.reviews.length === 1 && e.due > todayISO() }, topic.id));
    // Reassess
    const an = await p.evaluate(pid => { const f = forecast(pid); return {mt: f.MT, insights: insights().sections.find(s => s.k === 'chapters').items.length, loop: loopSteps().map(s => s.k + '=' + s.v)} }, pid);
    ok('loop 8 Reassess: analytics shows the mock trend and the chapter losing marks', an.mt.n === 2 && Math.abs(an.mt.slope - 6) < 1e-9 && an.insights === 1, an);
    await p.evaluate(() => location.hash = 'today'); await p.waitForTimeout(450);
    const steps = await p.$$eval('.loop .step', s => s.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    ok('Today: the preparation loop shows all 8 steps with live counts', steps.length === 8 && /Learn/.test(steps[0]) && /Reassess/.test(steps[7]) && /2d/.test(steps[3]), steps);
    ok('loop: no errors', !p.errs.length, p.errs); await p.ctx.close();
  }

  /* 2. today's plan follows setting changes until you start it */
  {
    const p = await open(b, {[LS]: base({ch: {'fr-0': {r: true, conf: 1, last: ymd(-30), hist: []}}})});
    const before = await p.evaluate(() => ({ids: S.plan[todayISO()].tasks.map(x => x.id).join(), target: S.plan[todayISO()].target}));
    await p.evaluate(() => { S.settings.tWd = 6; S.settings.tWe = 6; save(); render() }); await p.waitForTimeout(60);
    const after = await p.evaluate(() => ({target: S.plan[todayISO()].target, mins: S.plan[todayISO()].tasks.reduce((a, x) => a + x.mins, 0)}));
    ok('plan: an untouched plan rebuilds when hours change', after.target === 360 && after.mins === 360 && before.target === 150, {before, after});
    await p.click('button[data-act="ptskip"]'); await p.waitForTimeout(40);
    await p.evaluate(() => { S.settings.tWd = 2.5; S.settings.tWe = 2.5; save(); render() }); await p.waitForTimeout(60);
    ok('plan: once you act on it, the plan is kept (Rebuild is manual)', await p.evaluate(() => S.plan[todayISO()].target === 360));
    await p.ctx.close();
  }

  /* 3. data from the very first version upgrades all the way */
  {
    const v1 = {updatedAt: 9, settings: {examDate: '2028-11-02', startDate: ymd(-30), groups: 'both', tWd: 2.5, tWe: 8, target: 5, onBoard: true}, ch: {'fr-2': {r: true, conf: 3, last: ymd(-4)}}, log: {[ymd(-1)]: {fr: 2}}, mocks: [{id: 'm', paper: 'fr', date: ymd(-3), score: 52, max: 100, src: 'MTP'}], checks: {el1: true}, todos: {}};
    const j1 = [{id: 'j', p: 'fr', ch: 2, topic: 'Old topic', kind: 'Concept', created: ymd(-20), box: 3, due: ymd(2), reviews: [{d: ymd(-5), r: 'good'}], mastered: false}];
    const e1 = [{id: 'e', created: 1, paper: 'fr', name: 'Old eval', date: ymd(-6), max: 100, hasSol: false, pages: 3, result: {total: 48, summary: 's', confidence: 'medium', questions: [{q: '1', max: 100, awarded: 48, status: 'weak', credited: [], missed: [], feedback: 'f', icai_tip: ''}], strengths: [], improvements: [], presentation: '', time: ''}}];
    const p = await open(b, {[LS]: v1, [LS + '.journal']: j1, [LS + '.evals']: e1});
    const r = await p.evaluate(() => ({v: S.v, exam: S.settings.examDates.fr, ch: S.ch['fr-2'], mock: S.mocks[0], j: J[0], ev: EV[0] && EV[0].result.total, rp: !!store.get(LS + '.restorePoint', null), keys: ['plan', 'sessions', 'recall', 'recallLog', 'tsDismiss'].every(k => k in S)}));
    ok('upgrade v1 → current: settings, chapters, mocks, topics and evaluations kept', r.v === 5 && r.exam === '2028-11-02' && r.ch.r && Array.isArray(r.ch.hist) && Array.isArray(r.mock.mistakes) && r.j.cid === 'fr-2' && r.j.v === 2 && r.ev === 48, r);
    ok('upgrade: every newer data area exists, restore point saved', r.keys && r.rp, r);
    for (const t of TABS) { await p.evaluate(t => location.hash = t, t); await p.waitForTimeout(400) }
    ok('upgrade: every tab works with upgraded data', !p.errs.length, p.errs); await p.ctx.close();
  }

  /* 4. empty states, light and dark, phone and desktop */
  for (const [scheme, w] of [['light', 1280], ['dark', 390]]) {
    const p = await open(b, {}, 'today', {colorScheme: scheme, viewport: {width: w, height: 800}}); const over = [];
    for (const t of TABS) { await p.evaluate(t => location.hash = t, t); await p.waitForTimeout(420); const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (o > 0) over.push(t) }
    ok(`empty ${scheme} ${w}px: every tab renders, no errors, no sideways scroll`, !p.errs.length && !over.length, {e: p.errs, over}); await p.ctx.close();
  }

  /* 5. accessibility and contrast with realistic data */
  const rich = () => { const ch = {}; for (let i = 0; i < 12; i++) ch['fr-' + i] = {r: true, r1: i % 2 === 0, q: i % 3 === 0, conf: 1 + i % 5, last: ymd(-40 + i * 3), hist: [{d: ymd(-40 + i * 3), s: 'r'}]};
    for (let i = 0; i < 6; i++) ch['audit-' + i] = {r: true, last: ymd(-10), hist: []};
    return base({ch, settings: {groups: 'both', startDate: ymd(-90)}, log: Object.fromEntries(Array.from({length: 60}, (_, i) => [ymd(-i), {fr: 2}])),
      mocks: Array.from({length: 8}, (_, k) => ({id: 'm' + k, paper: ['fr', 'audit', 'dt', 'idt'][k % 4], date: ymd(-60 + k * 7), score: 40 + k * 3, max: 100, unattMarks: 4, mistakes: [{id: 'x' + k, q: '1', cid: ['fr', 'audit', 'dt', 'idt'][k % 4] + '-0', cat: ['calc', 'concept'][k % 2], lost: 5}]}))}) };
  for (const scheme of ['light', 'dark']) {
    const p = await open(b, {[LS]: rich()}, 'today', {colorScheme: scheme}); const bad = [], unnamed = [], perf = {};
    for (const t of TABS) {
      await p.evaluate(t => location.hash = t, t); await p.waitForTimeout(420);
      if (scheme === 'light') perf[t] = await p.evaluate(() => { const a = performance.now(); renderNow(); return Math.round(performance.now() - a) });
      const r = await p.evaluate(() => {
        const lum = c => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b, a] = m.map(Number); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4) }; return {L: .2126 * f(r) + .7152 * f(g) + .0722 * f(b), a: a == null ? 1 : a} };
        const bgOf = el => { for (let e = el; e; e = e.parentElement) { const l = lum(getComputedStyle(e).backgroundColor); if (l && l.a > .5) return l } return lum(getComputedStyle(document.body).backgroundColor) };
        const bad = []; document.querySelectorAll('#main *, header *').forEach(el => { if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return; const cs = getComputedStyle(el); if (cs.display === 'none' || +cs.opacity < .5) return;
          const fg = lum(cs.color), bg = bgOf(el); if (!fg || !bg) return; const ratio = (Math.max(fg.L, bg.L) + .05) / (Math.min(fg.L, bg.L) + .05), size = parseFloat(cs.fontSize), need = size >= 24 || (size >= 18.6 && +cs.fontWeight >= 600) ? 3 : 4.5;
          if (ratio < need) bad.push(el.className + ' "' + el.textContent.trim().slice(0, 24) + '" ' + ratio.toFixed(2)) });
        const unnamed = [...document.querySelectorAll('#main button, #main a, header a, #main input:not([type=hidden]), #main select, #main textarea')].filter(e => e.matches('input,select,textarea') ? !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('placeholder') : !(e.getAttribute('aria-label') || e.textContent).trim()).map(e => e.outerHTML.slice(0, 60));
        return {bad, unnamed}});
      r.bad.forEach(x => bad.push(t + ': ' + x)); r.unnamed.forEach(x => unnamed.push(t + ': ' + x));
    }
    ok(`contrast ${scheme}: all text meets WCAG AA on every tab`, !bad.length, bad.slice(0, 6));
    if (scheme === 'light') {
      ok('accessibility: every button, link and field has an accessible name', !unnamed.length, unnamed.slice(0, 5));
      ok('speed: every tab renders in under 150 ms with realistic data', Object.values(perf).every(v => v < 150), perf);
      await p.evaluate(() => location.hash = 'mocks'); await p.waitForTimeout(420);
      ok('accessibility: the current tab is announced (aria-current)', await p.evaluate(() => document.querySelector('#tabs a[aria-current="page"]').dataset.v === 'mocks' && document.querySelectorAll('#tabs a[aria-current]').length === 1));
      await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
      ok('accessibility: keyboard focus is visible', await p.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e); return e !== document.body && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }));
    }
    ok(`realistic data ${scheme}: no errors on any tab`, !p.errs.length, p.errs); await p.ctx.close();
  }

  await b.close();
  console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
