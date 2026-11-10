/* Phase 6 tests: question map, answer splitting, reading flags, review/correct, ICAI marking validation,
   manual adjustments, report and links to Mocks / Tough topics / plan.
   Run:  ./build.sh && node tests/phase6.test.js   (needs Playwright with Chromium) */
const {chromium} = require('playwright');
const path = require('path'), os = require('os');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const results = []; let failed = 0;
const ok = (name, cond, info) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (cond || info === undefined ? '' : '  → ' + JSON.stringify(info))); if (!cond) failed++; };
const ymd = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
const EX = {fr: '2028-11-02', afm: '2028-11-04', audit: '2028-11-06', dt: '2028-11-08', idt: '2028-11-10', ibs: '2028-11-12'};
const STATE = {v: 5, updatedAt: 5, settings: {startDate: ymd(-30), groups: 'both', tWd: 2.5, tWe: 8, revDays: 21, targetPct: 80, examDates: EX}, ch: {}, log: {}, mocks: [], checks: {}, todos: {}, plan: {}, sessions: [], recall: {}, recallLog: [], tsDismiss: {}};
const TRANSCRIPT = `[Page 1]
Name: student
### Q 1 a
Revenue is recognised using five steps [illegible] contract.
[page number written: 1]
### Q1(b)
Transaction price is [?12,000].
[Page 2]
### Q2
Working note 1: Consolidation...
### Q?
Some answer without a number.
[page number written: 3]
[Page 3]
### 6 (a)
Answer to 6a.
### Q6b
Answer to 6b.
### Q2
More of question 2.`;
const MAP = {instructions: 'Q1 and Q2 compulsory; answer any one of 6(a) or 6(b).', questions: [
  {q: '1(a)', max: 10, requirement: 'Explain the five-step model.', cid: 'fr-0', key_points: ['5 steps']},
  {q: '1 (b)', max: 10, requirement: 'Compute the transaction price.', cid: 'fr-0', key_points: []},
  {q: 'Q2', max: 20, requirement: 'Prepare consolidated balance sheet.', cid: 'fr-3', key_points: []},
  {q: '3', max: 10, requirement: 'Leases question.', cid: 'fr-4', key_points: []},
  {q: '6(a)', max: 10, requirement: 'Option A.', cid: 'fr-6', key_points: []}, {q: '6(b)', max: 10, requirement: 'Option B.', cid: 'bogus', key_points: []}],
  optional: [{options: ['6(a)', '6(b)'], required: 1}]};
const MARKS = {summary: 'Mixed.', confidence: 'high', questions: [
  {q: '1(a)', max: 10, awarded: 8, rubric: {concepts: 2, provisions: null, application: 1, calculation: null, presentation: 2, conclusion: 1}, credited: ['steps'], missed: ['constraint'], incorrect: [], mistakes: [{cat: 'concept', lost: 2, note: 'no constraint'}], cid: 'fr-0', feedback: 'ok'},
  {q: '1(b)', max: 10, awarded: 14, rubric: {calculation: 2}, mistakes: [], cid: 'fr-0', feedback: 'over max'},
  {q: '2', max: 20, awarded: 5, rubric: {calculation: 0, presentation: 1}, missed: ['NCI'], incorrect: ['Goodwill computed on book value'], mistakes: [{cat: 'calc', lost: 20, note: 'too much'}, {cat: 'nonsense', lost: 3}], cid: 'fr-3', carry_forward: true, feedback: 'weak'},
  {q: '3', max: 10, awarded: 6, mistakes: [], cid: 'fr-4', feedback: 'not answered really'},
  {q: '6(a)', max: 10, awarded: 7, mistakes: [{cat: 'presentation', lost: 3}], cid: 'fr-6', feedback: 'fine'},
  {q: '6(b)', max: 10, awarded: 9, mistakes: [], cid: 'fr-6', feedback: 'also fine'}], strengths: ['clear'], improvements: ['state constraint'], presentation: 'neat', time_management: 'ok'};

function fake(opts) {
  return ({opts}) => {
    localStorage.setItem('caFinalRankDesk.v1', JSON.stringify(opts.state));
    if (opts.evals) localStorage.setItem('caFinalRankDesk.v1.evals', JSON.stringify(opts.evals));
    window.__prompts = [];
    const s = async (prompt) => { window.__prompts.push('T'); return {text: opts.transcript, truncated: false} };
    s.limits = async () => ({maxPromptBytes: 262144, images: {maxCount: 20, maxInputBytes: 5e6, mediaTypes: ['image/jpeg', 'image/png']}, modelTiers: ['default', 'complex']});
    s.json = async (prompt, o) => { const isMap = /Build a QUESTION MAP/.test(prompt); window.__prompts.push(isMap ? 'MAP' : 'MARK:' + o.modelTier); if (!isMap) window.__markPrompt = prompt; return JSON.parse(JSON.stringify(isMap ? opts.map : opts.marks)) };
    window.claude = {use: async n => n === 'sample' ? s : null};
  };
}
async function open(b, opts, hash = 'evaluate', vp = {width: 1280, height: 900}) {
  const p = await b.newPage({viewport: vp}); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) errs.push(m.text()) });
  await p.addInitScript(fake(Object.assign({state: STATE, transcript: TRANSCRIPT, map: MAP, marks: MARKS}, opts)), {opts: Object.assign({state: STATE, transcript: TRANSCRIPT, map: MAP, marks: MARKS}, opts)});
  await p.goto(URL + '#' + hash); await p.waitForTimeout(400); p.errs = errs; return p;
}

(async () => {
  const b = await chromium.launch();
  const png = path.join(os.tmpdir(), 'rank-desk-p6.png');
  { const g = await b.newPage(); await g.setContent('<div style="width:600px;height:800px;background:#fff">answers</div>'); await g.screenshot({path: png}); await g.close() }

  /* 1. question-number normalisation */
  {
    const p = await open(b, {});
    const r = await p.evaluate(() => ['Q 1 a', '1(a)', 'Question 2', 'q2.(b)', '6 (a)', 'Q6b', '2(a)(ii)', '?', ''].map(normQ));
    ok('normQ: different ways of writing a question number match', r.join('|') === '1(a)|1(a)|2|2(b)|6(a)|6(b)|2(a)(ii)|?|?', r);
    await p.close();
  }

  /* 2. read stage: map, split, flags, draft */
  const p = await open(b, {});
  await p.fill('#evQPT', 'Q1(a) 10 marks ...'); await p.dispatchEvent('#evQPT', 'change');
  await p.setInputFiles('#evAns', png); await p.waitForTimeout(80);
  await p.click('button[data-act="evrun"]'); await p.waitForSelector('button[data-act="evmark"]', {timeout: 15000}).catch(() => {});
  {
    const r = await p.evaluate(() => { const e = EV[0]; return {draft: e.draft, map: e.map.questions.map(q => q.q + ':' + q.max + ':' + q.cid), opt: e.map.optional, ans: e.answers.map(a => a.q + '@' + a.pages.join('/')), q2: e.answers.find(a => a.q === '2').text, un: e.unassigned, flags: draftFlags(e).map(f => f.t + ':' + f.msg), calls: window.__prompts} });
    ok('read: a draft is saved before marking (nothing marked yet)', r.draft === true && !r.calls.some(c => c.startsWith('MARK')), r.calls);
    ok('map: question numbers normalised, marks kept, invalid chapter dropped', r.map.join() === '1(a):10:fr-0,1(b):10:fr-0,2:20:fr-3,3:10:fr-4,6(a):10:fr-6,6(b):10:null', r.map);
    ok('map: optional choice captured', r.opt.length === 1 && r.opt[0].required === 1 && r.opt[0].options.join() === '6(a),6(b)', r.opt);
    ok('split: answers matched to questions from the "### Q" lines', r.ans.join() === '1(a)@1,1(b)@1,2@2/3,?@2,6(a)@3,6(b)@3', r.ans);
    ok('split: a repeated question number is joined as a continuation', /Consolidation/.test(r.q2) && /\[continued\]/.test(r.q2) && /More of question 2/.test(r.q2), r.q2);
    ok('split: text before any question number kept as "not assigned"', /Name: student/.test(r.un), r.un);
    const f = r.flags.join(' || ');
    ok('flags: unclear number, missing page, unanswered question and unassigned text', /no clear question number/.test(f) && /jump from 1 to 3/.test(f) && /No answer found for Q3/.test(f) && /before any question number/.test(f), r.flags);
    const af = await p.evaluate(() => EV[0].answers.map(a => answerFlags(a).map(x => x.t).join('+')));
    ok('flags: unclear words and uncertain figures counted per answer', af[0] === 'unclear' && af[1] === 'calc', af);
    const txt = await p.textContent('#main');
    ok('review: draft view shows the check step and the mark button', /Check before marking/.test(txt) && /Mark against ICAI standards/.test(txt));
  }

  /* 3. correct the transcription before marking */
  {
    const sel = 'textarea[data-act="evans"][data-i="1"]';
    await p.fill(sel, 'Transaction price is 12,000.'); await p.dispatchEvent(sel, 'change'); await p.waitForTimeout(40);
    await p.selectOption('select[data-act="evqmap"][data-i="3"]', '1(b)'); await p.waitForTimeout(60);
    const r = await p.evaluate(() => ({b: EV[0].answers.find(a => a.q === '1(b)').text, n: EV[0].answers.length, amb: draftFlags(EV[0]).some(f => /no clear question number/.test(f.msg))}));
    ok('correct: edited text is kept', /12,000\./.test(r.b) && !/\[\?/.test(r.b), r.b);
    ok('correct: reassigning an unnumbered answer to an existing question joins them', r.n === 5 && /without a number/.test(r.b) && !r.amb, r);
  }

  /* 4. marking: validation of marks */
  await p.click('button[data-act="evmark"]'); await p.waitForSelector('button[data-act="evmock"]', {timeout: 15000}).catch(() => {});
  {
    const r = await p.evaluate(() => { const e = EV[0], Q = q => e.result.questions.find(x => x.q === q); return {draft: e.draft, total: e.result.total, a: Q('1(a)'), b: Q('1(b)'), q2: Q('2'), q3: Q('3'), x: Q('6(a)'), y: Q('6(b)'), note: e.recNote, rev: e.result.revision, tier: window.__prompts.find(c => c.startsWith('MARK')), mp: window.__markPrompt} });
    ok('mark: draft becomes a marked evaluation', r.draft === false);
    ok('mark: question marks capped at the map maximum', r.b.awarded === 10, r.b);
    ok('mark: unanswered question gets 0 even if the AI gave marks', r.q3.awarded === 0 && r.q3.status === 'not_attempted', r.q3);
    ok('mark: only the first optional answer counts (ICAI practice)', r.x.awarded === 7 && r.y.awarded === 0 && r.y.status === 'excess' && /not counted/.test(r.note), {x: r.x, y: r.y, n: r.note});
    ok('mark: total reconciles to the sum of counted questions', r.total === 8 + 10 + 5 + 0 + 7, r.total);
    ok('mark: lost marks never exceed max − awarded; unknown mistake types dropped', r.q2.mistakes.length === 1 && r.q2.mistakes[0].cat === 'calc' && r.q2.mistakes[0].lost === 15, r.q2.mistakes);
    ok('mark: criteria scores, incorrect treatment and carry-forward kept', r.a.rubric.concepts === 2 && r.a.rubric.provisions === null && r.q2.incorrect.length === 1 && r.q2.carry === true, r.q2);
    ok('mark: priority revision chapters ranked by marks lost', r.rev[0].cid === 'fr-3' && r.rev[0].lost === 15, r.rev);
    ok('mark: uses the strongest available model and the corrected answers', r.tier === 'MARK:complex' && /12,000\./.test(r.mp) && /=== Q1\(b\) \(max 10\) ===/.test(r.mp), r.tier);
    const txt = await p.textContent('#main');
    ok('report: estimate label, revision topics and plan button shown', /not official ICAI marks/.test(txt) && /Priority revision topics/.test(txt) && /Add revision tasks to today's plan/.test(txt));
  }

  /* 5. links: Mocks with classified mistakes, manual adjustment updates the mock, plan tasks, tough topics */
  {
    await p.click('button[data-act="evmock"]'); await p.waitForTimeout(60);
    const m = await p.evaluate(() => S.mocks[0]);
    ok('mocks: saved with classified mistakes and chapters', m.score === 30 && m.mistakes.some(x => x.cat === 'calc' && x.cid === 'fr-3' && x.lost === 15) && m.mistakes.some(x => x.cat === 'concept' && x.cid === 'fr-0'), m.mistakes);
    ok('mocks: unattempted marks recorded, never more than marks not scored', m.unattMarks === 10 && m.mistakes.reduce((a, x) => a + x.lost, 0) + m.unattMarks <= 70, m);
    await p.click('button[data-act="evqd"][data-k$="-0"]'); await p.waitForTimeout(40);
    await p.fill('input[data-act="evadj"]', '10'); await p.dispatchEvent('input[data-act="evadj"]', 'change'); await p.waitForTimeout(60);
    const a = await p.evaluate(() => ({q: EV[0].result.questions[0], total: EV[0].result.total, mock: S.mocks[0].score}));
    ok('adjust: your mark replaces the AI mark, which is kept for reference', a.q.awarded === 10 && a.q.orig === 8 && a.q.adjusted === true, a.q);
    ok('adjust: total and the saved mock update', a.total === 32 && a.mock === 32, a);
    await p.fill('input[data-act="evadj"]', '25'); await p.dispatchEvent('input[data-act="evadj"]', 'change'); await p.waitForTimeout(60);
    ok('adjust: can\'t exceed the question maximum', await p.evaluate(() => EV[0].result.questions[0].awarded === 10));
    await p.click('button[data-act="evplan"]'); await p.waitForTimeout(60);
    const pl = await p.evaluate(() => S.plan[todayISO()].tasks.filter(t => /Lost/.test(t.why)).map(t => t.cid));
    ok('plan: revision tasks for the weakest chapters added to today\'s plan', pl.length >= 2 && pl[0] === 'fr-3', pl);
    await p.click('button[data-act="evtough"]'); await p.waitForTimeout(60);
    const j = await p.evaluate(() => J.filter(e => e.src === 'eval').map(e => e.cid + ':' + e.cat));
    ok('tough topics: weak answers added with chapter and main mistake type', j.includes('fr-3:calc'), j);
    ok('flow: no errors', !p.errs.length, p.errs);
  }
  await p.close();

  /* 6. compatibility: old evaluations display; drafts don't break other tabs; backup keeps drafts */
  {
    const old = {id: 'old', created: 1, paper: 'dt', name: 'Old', date: ymd(-5), max: 100, hasSol: true, pages: 2, result: {total: 40, summary: 's', questions: [{q: '1', max: 100, awarded: 40, status: 'weak', credited: [], missed: [], feedback: 'f'}], strengths: [], improvements: []}};
    const draft = {id: 'dr', v: 2, draft: true, created: 2, paper: 'fr', name: 'Draft', date: ymd(0), max: 100, pages: 1, map: {questions: [], optional: []}, answers: [], unassigned: ''};
    const q = await open(b, {evals: [old, draft]}, 'today');
    for (const v of ['today', 'journal', 'mocks', 'evaluate']) { await q.evaluate(v => location.hash = v, v); await q.waitForTimeout(450) }
    await q.click('button[data-act="evopen"][data-id="old"]'); await q.waitForTimeout(60);
    const txt = await q.textContent('#main');
    ok('compat: old-format evaluation still opens', /Old/.test(txt) && /40/.test(txt));
    ok('compat: a waiting draft is listed and doesn\'t break Today, Tough topics or Mocks', /to check/.test(txt) && !q.errs.length, q.errs);
    const bk = await q.evaluate(() => readBackup(JSON.stringify(makeBackup(false))).evals.map(e => e.id).sort().join());
    ok('backup: drafts included', bk === 'dr,old', bk);
    await q.close();
  }

  /* 7. phone layout of the check step */
  {
    const q = await open(b, {}, 'evaluate', {width: 390, height: 800});
    await q.fill('#evQPT', 'x'); await q.dispatchEvent('#evQPT', 'change'); await q.setInputFiles('#evAns', png);
    await q.click('button[data-act="evrun"]'); await q.waitForSelector('button[data-act="evmark"]', {timeout: 15000}).catch(() => {}); await q.waitForTimeout(450);
    const over = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('phone: check step has no sideways scroll or errors', over <= 0 && !q.errs.length, {over, e: q.errs}); await q.close();
  }

  await b.close();
  console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
