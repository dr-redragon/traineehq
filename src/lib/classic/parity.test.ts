/**
 * Differential test against the original register.
 *
 * The functions under `// verbatim from` below are copied unchanged out of
 * `dr-redragon/ent-teaching-register/index.html`, and the modules in this folder
 * are checked to agree with them on randomised classic_registers.
 *
 * This is kept rather than thrown away after the port, because until the Stage 10
 * cutover both classic_registers are live at once against the same cohort. If the ported
 * rules drift from the original, the two systems start reporting different
 * attendance for the same trainee — the kind of divergence nobody notices until
 * an ARCP. This test fails the moment that happens.
 *
 * The legacy half is deliberately unmodernised: `any`, `var`-style flow and all.
 * Tidying it would defeat the purpose, which is that it is the original code.
 *
 * ONE INTENTIONAL DIVERGENCE. The original matched an excusal on the *month* of
 * the session it was logged against; the port matches the session itself. The two
 * agree entirely on classic_registers with at most one teaching day a month, which is
 * every real one, so the randomised fixtures below are generated that way and
 * still assert exact agreement. The case where they differ is asserted
 * separately, at the bottom, so the difference is pinned down rather than
 * papered over.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
import { describe, expect, it } from "vitest";
import { parseMonth, academicYearOf } from "./months";
import { isEligible, isExcused, cellState } from "./eligibility";
import { computeRow } from "./report";

// ---- verbatim from ent-teaching-register/index.html --------------------------
let DB: any = null;
const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_ABBR=MONTH_NAMES.map(m=>m.slice(0,3));
function origParseMonth(raw:any){
  if(!raw) return '';
  let s=String(raw).trim().toLowerCase().replace(/[.,]/g,' ').replace(/\s+/g,' ').trim();
  if(!s) return '';
  let m=s.match(/^(\d{4})[-/ ](\d{1,2})$/);
  if(m){ const mo=+m[2]; if(mo>=1&&mo<=12) return m[1]+'-'+String(mo).padStart(2,'0'); }
  m=s.match(/^(\d{1,2})[-/ ](\d{4})$/);
  if(m){ const mo=+m[1]; if(mo>=1&&mo<=12) return m[2]+'-'+String(mo).padStart(2,'0'); }
  m=s.match(/^(\d{1,2})[-/ ](\d{2})$/);
  if(m){ const mo=+m[1]; if(mo>=1&&mo<=12) return '20'+m[2]+'-'+String(mo).padStart(2,'0'); }
  const names:any=MONTH_NAMES.map((n,i)=>[n,i]).concat(MONTH_ABBR.map((n,i)=>[n,i])).concat([['sept',8]] as any);
  for(const [nm0,idx] of names){
    const nm=String(nm0).toLowerCase();
    const re1=new RegExp('^'+nm+'[a-z]* (\\d{2,4})$');
    const re2=new RegExp('^(\\d{2,4}) '+nm+'[a-z]*$');
    let mm=s.match(re1)||s.match(re2);
    if(mm){ let y=mm[1]; if(y.length===2) y='20'+y; return y+'-'+String(idx+1).padStart(2,'0'); }
  }
  m=s.match(/^(\d{4})(\d{2})$/);
  if(m){ const mo=+m[2]; if(mo>=1&&mo<=12) return m[1]+'-'+m[2]; }
  return '';
}
function acYearStart(month:any){ const [y,m]=String(month).split('-').map(Number); return m>=8?y:y-1; }
function acYearLabel(startY:any){ return startY+'/'+String(startY+1).slice(-2); }
function origSessAcademicYear(month:any){ return acYearLabel(acYearStart(month)); }
function statusFor(traineeId:any){ return DB.status.filter((s:any)=>s.trainee===traineeId); }
function findSession(id:any){ return DB.sessions.find((s:any)=>s.id===id); }
function attKey(t:any,s:any){ return t+'|'+s; }
function origIsEligible(traineeId:any, sessMonth:any){
  for(const st of statusFor(traineeId)){
    if(st.type==='active') continue;
    if(st.type==='cct'){ const m=st.end||st.start; if(m && sessMonth>m) return false; }
    else if(st.type==='idt_out'){ const m=st.start||st.end; if(m && sessMonth>=m) return false; }
    else if(st.type==='idt_in'){ const m=st.start||st.end; if(m && sessMonth<m) return false; }
    else if(st.type==='mat'||st.type==='oop'){
      const afterStart = st.start ? sessMonth >= st.start : true;
      const beforeEnd  = st.end   ? sessMonth <= st.end   : true;
      if(afterStart && beforeEnd) return false;
    }
  }
  return true;
}
function origIsExcused(traineeId:any, sessMonth:any){
  return DB.excused.some((e:any)=>e.trainee===traineeId && findSession(e.session) && findSession(e.session).month===sessMonth);
}
function origCellState(traineeId:any, sess:any){
  if(!origIsEligible(traineeId, sess.month)) return 'na';
  if(DB.attendance[attKey(traineeId,sess.id)]) return 'present';
  if(origIsExcused(traineeId, sess.month)) return 'excused';
  return 'absent';
}
function origComputeRow(trainee:any, sessList:any){
  let attended=0,total=0,excused=0,eligible=0; const cells:any=[];
  for(const s of sessList){
    const st=origCellState(trainee.id,s); cells.push({sess:s,state:st}); total++;
    if(st==='na') continue;
    eligible++; if(st==='present') attended++; if(st==='excused') excused++;
  }
  const adjDenom=eligible-excused;
  const rawPct=total? Math.round(attended/total*100):0;
  const adjPct=adjDenom>0? Math.round(attended/adjDenom*100): (eligible===0? null : 0);
  return {attended,total,excused,eligible,adjDenom,rawPct,adjPct};
}
// -----------------------------------------------------------------------------

// Deterministic PRNG so a failure is reproducible.
let seed = 20260907;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];

const TYPES = ["active", "cct", "idt_in", "idt_out", "mat", "oop"] as const;
const MONTHS = ["2024-08", "2025-01", "2025-08", "2025-09", "2026-02", "2026-07", "2026-08", null];

function randomBlob() {
  // One teaching day a month, as every real register runs. Where a month held
  // two, the ported excusal rule intentionally differs from the original — see
  // the header, and the dedicated test below.
  const pool: string[] = [];
  for (let y = 2024; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) pool.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const sessions = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, i) => ({
    id: `s${i}`,
    month: pool[i],
    title: `S${i}`,
  }));
  const trainees = Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, i) => ({
    id: `t${i}`, name: `T${i}`,
  }));
  const status = Array.from({ length: Math.floor(rnd() * 4) }, (_, i) => ({
    id: `st${i}`,
    trainee: pick(trainees).id,
    type: pick(TYPES as unknown as string[]),
    start: pick(MONTHS),
    end: pick(MONTHS),
  }));
  const attendance: Record<string, unknown> = {};
  for (const t of trainees) for (const s of sessions) {
    const r = rnd();
    if (r < 0.3) attendance[`${t.id}|${s.id}`] = true;
    else if (r < 0.5) attendance[`${t.id}|${s.id}`] = { grade: "ST6" };
  }
  const excused = Array.from({ length: Math.floor(rnd() * 3) }, (_, i) => ({
    id: `e${i}`, trainee: pick(trainees).id, session: pick(sessions).id, reason: "", ts: "",
  }));
  return { trainees, sessions, attendance, excused, status } as any;
}

describe("parity with the original implementation", () => {
  it("parseMonth agrees on every input form", () => {
    const inputs = [
      "2026-01","2026/1","01-2026","1/2026","01/26","202601","Jan 2026","january 2026",
      "2026 March","sept 26","sep 2026","Dec 2025","  Jan  2026 ","Jan. 2026","",
      "nonsense","2026-13","13/2026","2026","2026-00","JULY 2026","jul 26","2026 sept",
      "may 2026","march 2026","0/2026","2026-1","99/99","12-2026","2026 12",
    ];
    for (const i of inputs) expect([i, parseMonth(i)]).toEqual([i, origParseMonth(i)]);
  });

  it("academicYearOf agrees across every month boundary", () => {
    for (let y = 2023; y <= 2027; y++) {
      for (let m = 1; m <= 12; m++) {
        const month = `${y}-${String(m).padStart(2, "0")}`;
        expect([month, academicYearOf(month)]).toEqual([month, origSessAcademicYear(month)]);
      }
    }
  });

  it("differs from the original only where one month holds two teaching days", () => {
    const blob = {
      trainees: [{ id: "t1", name: "Alice" }],
      sessions: [
        { id: "s1", month: "2026-01", title: "First" },
        { id: "s2", month: "2026-01", title: "Second" },
      ],
      attendance: {},
      excused: [{ id: "e1", trainee: "t1", session: "s1", reason: "", ts: "" }],
      status: [],
    } as any;
    DB = blob;

    // Both agree the excused day is excused.
    expect(cellState(blob, "t1", blob.sessions[0])).toBe("excused");
    expect(origCellState("t1", blob.sessions[0])).toBe("excused");

    // They part company on the second day of the same month: the original
    // excused it too, the port marks it absent.
    expect(origCellState("t1", blob.sessions[1])).toBe("excused");
    expect(cellState(blob, "t1", blob.sessions[1])).toBe("absent");
  });

  it("eligibility, excusal, cell state and row totals agree over 400 random classic_registers", () => {
    for (let n = 0; n < 400; n++) {
      const blob = randomBlob();
      DB = blob;

      for (const t of blob.trainees) {
        for (const s of blob.sessions) {
          expect(isEligible(blob, t.id, s.month)).toBe(origIsEligible(t.id, s.month));
          expect(isExcused(blob, t.id, s.id)).toBe(origIsExcused(t.id, s.month));
          expect(cellState(blob, t.id, s)).toBe(origCellState(t.id, s));
        }

        const mine = computeRow(blob, t, blob.sessions);
        const theirs = origComputeRow(t, blob.sessions);
        expect({
          attended: mine.attended, total: mine.total, excused: mine.excused,
          eligible: mine.eligible, adjDenom: mine.adjDenom,
          rawPct: mine.rawPct, adjPct: mine.adjPct,
        }).toEqual(theirs);
      }
    }
  });
});
