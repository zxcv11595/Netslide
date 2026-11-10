// 출시 판 생성 도구 (개발용).
//   node tools/generate.js [--seed 20261111] [--quick]
// 정답 배치 → 합법 이동 셔플 → 역순 해답 보관 → 공통 규칙으로 재생 확인 → 풀이 BFS
// → 중복/과도한 쉬움 제거 → 난이도·별 기준 지정 순으로 처리한다.
// 출력:
//   src/data/stages.json        게임이 읽는 판 데이터(해답 없음)
//   tools/out/solutions.json    개발용 검증 자료(해답·탐색량)
//   docs/STAGE_REPORT.md        판 목록/검증 보고서
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  N, E, S, W, DIRS, opposite, dirDelta, parseTile, tileCode, legalMoves, shiftBoard,
  inverseMove, moveToCode, moveFromCode, evaluateConnections, evaluateResult, validateStage,
} from '../src/core/rules.js';
import { solve, replay } from '../src/core/solver.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const BASE_SEED = Number(argOf('--seed', 20261111));
const QUICK = args.includes('--quick');
const CONTENT_VERSION = 1;
const DAILY_EPOCH = '2026-11-11';

// ---------- 난수 ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const shuffled = (r, arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------- 입문(수작업) ----------
const TUTORIALS = [
  { id: 'T1', size: 3, tiles: ['p6 p10 g8', 'p5 s2 p0', 'p3 p10 p0'] },
  { id: 'T2', size: 3, tiles: ['g8 p10 p6', 'p0 s1 p0', 'p9 p0 p3'] },
  { id: 'T3', size: 3, tiles: ['p6 p10 g8', 'p5 s6 p0', 'g1 p0 p9'] },
];

// ---------- 생성 계획 ----------
// min: 기본 클리어 최단 이동 수의 허용 범위(증명된 값 기준)
const PLAN = [
  { group: 'beginner', size: 3, req: 1, bonus: 0, oneway: 0, min: [2, 3], count: 2 },
  { group: 'beginner', size: 3, req: 2, bonus: 0, oneway: 0, min: [2, 4], count: 2 },
  { group: 'beginner', size: 4, req: 1, bonus: 0, oneway: 0, min: [2, 3], count: 2 },
  { group: 'beginner', size: 4, req: 2, bonus: 0, oneway: 0, min: [3, 4], count: 3 },
  { group: 'beginner', size: 4, req: 2, bonus: 1, oneway: 0, min: [3, 4], count: 1 },
  { group: 'intermediate', size: 4, req: 2, bonus: 0, oneway: 0, min: [4, 5], count: 3 },
  { group: 'intermediate', size: 4, req: 2, bonus: 1, oneway: 1, min: [4, 5], count: 3 },
  { group: 'intermediate', size: 4, req: 3, bonus: 0, oneway: 1, min: [5, 6], count: 2 },
  { group: 'intermediate', size: 4, req: 3, bonus: 1, oneway: 1, min: [5, 6], count: 2 },
  { group: 'advanced', size: 4, req: 3, bonus: 1, oneway: 2, min: [6, 8], count: 4 },
  { group: 'advanced', size: 5, req: 2, bonus: 1, oneway: 1, min: [4, 5], count: 2 },
  { group: 'advanced', size: 5, req: 3, bonus: 1, oneway: 2, min: [5, 6], count: 4 },
];
const DAILY_PLAN = [
  { group: 'daily', size: 4, req: 2, bonus: 1, oneway: 1, min: [4, 6], count: 21 },
  { group: 'daily', size: 5, req: 2, bonus: 1, oneway: 1, min: [4, 5], count: 7 },
];
const SLACK = { beginner: 1, intermediate: 1, advanced: 0, daily: 1 };
const DECOY_BLANK = { beginner: 0.4, intermediate: 0.25, advanced: 0.15, daily: 0.25 };
const MAX_STATES = { 3: 200000, 4: 1500000, 5: 2500000 };

// ---------- 정답 배치 만들기 ----------
function buildSolved(r, spec) {
  const n = spec.size;
  const total = n * n;
  const src = n === 4 ? pick(r, [5, 6, 9, 10]) : (total - 1) / 2;
  const others = shuffled(r, [...Array(total).keys()].filter((p) => p !== src));
  const goalPos = others.slice(0, spec.req + spec.bonus);
  const isGoal = new Set(goalPos);
  const ports = new Array(total).fill(0);
  const inTree = new Set([src]);
  const weight = Array.from({ length: total }, () => 1 + r() * 3);

  for (const g of goalPos) {
    // 목표 g에서 트리까지 무작위 가중치 최단 경로
    const dist = new Array(total).fill(Infinity);
    const prev = new Array(total).fill(-1);
    const done = new Array(total).fill(false);
    dist[g] = 0;
    let hit = -1;
    for (;;) {
      let u = -1;
      for (let i = 0; i < total; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      if (inTree.has(u)) { hit = u; break; }
      const ur = Math.floor(u / n);
      const uc = u % n;
      for (const d of DIRS) {
        const { dr, dc } = dirDelta(d);
        const vr = ur + dr;
        const vc = uc + dc;
        if (vr < 0 || vr >= n || vc < 0 || vc >= n) continue;
        const v = vr * n + vc;
        if (isGoal.has(v)) continue; // 목표 칸은 통로로 쓰지 않는다
        if (dist[u] + weight[v] < dist[v]) { dist[v] = dist[u] + weight[v]; prev[v] = u; }
      }
    }
    if (hit < 0) return null;
    for (let v = hit; prev[v] !== -1; v = prev[v]) {
      const u = prev[v];
      const d = DIRS.find((dd) => {
        const { dr, dc } = dirDelta(dd);
        return Math.floor(v / n) + dr === Math.floor(u / n) && (v % n) + dc === u % n;
      });
      ports[v] |= d;
      ports[u] |= opposite(d);
      inTree.add(u);
    }
  }

  // 트리에서 공급원 쪽 방향
  const towardSrc = new Array(total).fill(0);
  const seen = new Set([src]);
  const queue = [src];
  while (queue.length) {
    const u = queue.shift();
    for (const d of DIRS) {
      if (!(ports[u] & d)) continue;
      const { dr, dc } = dirDelta(d);
      const v = (Math.floor(u / n) + dr) * n + (u % n) + dc;
      if (seen.has(v)) continue;
      seen.add(v);
      towardSrc[v] = opposite(d);
      queue.push(v);
    }
  }

  const tiles = new Array(total);
  const blank = DECOY_BLANK[spec.group];
  const onewayCells = shuffled(r, [...inTree].filter((p) => p !== src && !isGoal.has(p)
    && DIRS.filter((d) => ports[p] & d).length === 2)).slice(0, spec.oneway);
  if (onewayCells.length < spec.oneway) return null;
  for (let p = 0; p < total; p++) {
    if (p === src) tiles[p] = { kind: 'source', ports: ports[p] };
    else if (isGoal.has(p)) {
      tiles[p] = { kind: 'goal', ports: ports[p], bonus: goalPos.indexOf(p) >= spec.req };
    } else if (onewayCells.includes(p)) {
      tiles[p] = { kind: 'oneway', in: towardSrc[p], out: ports[p] & ~towardSrc[p] };
    } else if (inTree.has(p)) {
      tiles[p] = { kind: 'pipe', ports: ports[p] };
    } else if (r() < blank) {
      tiles[p] = { kind: 'pipe', ports: 0 };
    } else {
      tiles[p] = { kind: 'pipe', ports: pick(r, [5, 10, 3, 6, 12, 9, 3, 6, 12, 9, 7, 11, 13, 14]) };
    }
  }
  return { tiles, src };
}

// ---------- 회전/반사 중복 판정 ----------
// 공급원 위치를 보존하는 변환에서만 같은 판으로 본다(잠금 줄과 방향성도 함께 변환된다).
const ROT = { [N]: E, [E]: S, [S]: W, [W]: N };
const FLIP = { [N]: N, [S]: S, [E]: W, [W]: E };
const mapMask = (mask, f) => DIRS.reduce((m, d) => (mask & d ? m | f[d] : m), 0);
function transformTile(t, f) {
  if (t.kind === 'oneway') return { ...t, in: f[t.in], out: f[t.out] };
  return { ...t, ports: mapMask(t.ports, f) };
}
function canonical(size, tiles) {
  const n = size;
  let grid = tiles;
  const forms = [];
  const srcOf = (g) => g.findIndex((t) => t.kind === 'source');
  const src0 = srcOf(tiles);
  for (let flip = 0; flip < 2; flip++) {
    for (let rot = 0; rot < 4; rot++) {
      if (srcOf(grid) === src0) forms.push(grid.map(tileCode).join(' '));
      const next = new Array(n * n);
      for (let rr = 0; rr < n; rr++) for (let c = 0; c < n; c++) next[c * n + (n - 1 - rr)] = transformTile(grid[rr * n + c], ROT);
      grid = next;
    }
    const next = new Array(n * n);
    for (let rr = 0; rr < n; rr++) for (let c = 0; c < n; c++) next[rr * n + (n - 1 - c)] = transformTile(grid[rr * n + c], FLIP);
    grid = next;
  }
  return forms.sort()[0];
}

// ---------- 후보 하나 만들기 ----------
function tryCandidate(r, spec, seenForms) {
  const solved = buildSolved(r, spec);
  if (!solved) return { reject: 'build' };
  const n = spec.size;
  const probe = { size: n, tiles: solved.tiles };
  const moves = legalMoves(probe);

  // 합법 이동으로 셔플 (직전 이동의 역이동은 피한다). N번 셔플이 최소 N수를 뜻하지는 않는다.
  const shuffleLen = spec.min[1] + 2 + Math.floor(r() * 4);
  let cells = [...Array(n * n).keys()];
  const applied = [];
  for (let i = 0; i < shuffleLen; i++) {
    let m;
    do { m = pick(r, moves); } while (applied.length && moveToCode(inverseMove(applied[applied.length - 1])) === moveToCode(m));
    cells = shiftBoard(probe, cells, m).cells;
    applied.push(m);
  }
  const stage = { size: n, tiles: cells.map((id) => solved.tiles[id]), tutorial: false, star2: 99, star3: 98 };
  const known = applied.slice().reverse().map((m) => moveToCode(inverseMove(m)));

  // 역순 해답을 공통 규칙으로 재생해 필수+보너스가 모두 이어지는지 확인
  const rep = replay(stage, known, moveFromCode);
  if (!rep.ok) return { reject: 'replay' };
  const endRes = evaluateResult(stage, evaluateConnections(stage, rep.cells), known.length);
  if (!endRes.requiredDone || (spec.bonus && !endRes.bonusDone)) return { reject: 'replay' };

  const form = canonical(n, stage.tiles);
  if (seenForms.has(form)) return { reject: 'duplicate' };

  // 값싼 사전 탐색으로 너무 쉬운 판을 먼저 거른다
  const pre = solve(stage, { maxStates: 20000 });
  if (pre.basic && pre.basic.length < spec.min[0]) return { reject: 'too-easy' };

  const sol = solve(stage, { maxStates: QUICK ? 200000 : MAX_STATES[n] });
  if (!sol.basic) return { reject: 'basic-unproven' };
  if (sol.basic.length < spec.min[0]) return { reject: 'too-easy' };
  if (sol.basic.length > spec.min[1]) return { reject: 'too-hard' };
  // 서로 다른 판단: 한 줄만 반복하는 풀이는 제외
  const lines = new Set(sol.basic.moves.map((c) => c.slice(0, -1)));
  const axes = new Set(sol.basic.moves.map((c) => c[0]));
  if (lines.size < 2) return { reject: 'single-line' };
  if (sol.basic.length >= 3 && axes.size < 2) return { reject: 'single-axis' };

  // 보너스 포함 해답도 최단 증명된 판만 채택하고, 기본 해답과 너무 벌어지는 판은 제외한다.
  if (!sol.full) return { reject: 'full-unproven' };
  if (sol.full.length - sol.basic.length > 3) return { reject: 'bonus-too-far' };
  const full = sol.full;
  const fullProven = true;
  const slack = SLACK[spec.group];
  const target = fullProven ? full.length + slack : full.length;
  stage.star3 = target;
  stage.star2 = spec.bonus ? null : target + 2;
  return {
    stage, form,
    solution: {
      basic: sol.basic, basicProven: true,
      full, fullProven,
      states: sol.states, limitHit: sol.limitHit,
    },
  };
}

function generateGroup(plan, seedBase, seenForms, log) {
  const out = [];
  plan.forEach((spec, si) => {
    const r = rng(seedBase + si * 7919);
    const rejects = {};
    let made = 0;
    let attempts = 0;
    const maxAttempts = 6000;
    while (made < spec.count && attempts < maxAttempts) {
      attempts++;
      const c = tryCandidate(r, spec, seenForms);
      if (c.reject) { rejects[c.reject] = (rejects[c.reject] || 0) + 1; continue; }
      seenForms.add(c.form);
      out.push({ spec, ...c });
      made++;
      process.stdout.write(`  ${spec.group} ${spec.size}x${spec.size} req${spec.req}+b${spec.bonus} ow${spec.oneway}: ${made}/${spec.count} (기본 ${c.solution.basic.length}수, 전체 ${c.solution.full.length}수${c.solution.fullProven ? '' : ' 미증명'}, 상태 ${c.solution.states})\n`);
    }
    log.push({ spec, made, attempts, rejects });
  });
  return out;
}

// ---------- 실행 ----------
const t0 = Date.now();
const seenForms = new Set();
const log = [];
const stagesOut = [];
const solutions = {};
const reportRows = [];

const rowsOf = (size, tiles) => Array.from({ length: size }, (_, rr) => tiles.slice(rr * size, rr * size + size).map(tileCode).join(' '));

// 입문
TUTORIALS.forEach((t, i) => {
  const stage = { size: t.size, tiles: t.tiles.flatMap((row) => row.split(' ')).map(parseTile), tutorial: true };
  const errs = validateStage(stage);
  if (errs.length) throw new Error(`${t.id}: ${errs.join(', ')}`);
  const sol = solve(stage, { maxStates: 200000 });
  if (!sol.basic || sol.basic.length < 1) throw new Error(`${t.id}: 입문 판 풀이 실패`);
  stagesOut.push({ id: t.id, group: 'tutorial', order: i + 1, size: t.size, tiles: t.tiles });
  solutions[t.id] = { basic: sol.basic, basicProven: true, full: sol.full, fullProven: true, states: sol.states, limitHit: false };
  reportRows.push({ id: t.id, group: 'tutorial', order: i + 1, size: t.size, req: stage.tiles.filter((x) => x.kind === 'goal' && !x.bonus).length, bonus: 0, oneway: 0, sol: solutions[t.id], star2: null, star3: null });
  seenForms.add(canonical(t.size, stage.tiles));
});

console.log('정규 판 생성...');
const regular = generateGroup(PLAN, BASE_SEED, seenForms, log);
const prefix = { beginner: 'B', intermediate: 'M', advanced: 'A', daily: 'D' };
for (const group of ['beginner', 'intermediate', 'advanced']) {
  // 표시 순서: 판 크기 → 기본 최단 수 → 전체 최단 수
  const list = regular.filter((x) => x.spec.group === group).sort((a, b) => a.spec.size - b.spec.size
    || a.solution.basic.length - b.solution.basic.length || a.solution.full.length - b.solution.full.length);
  list.forEach((x, i) => {
    const id = `${prefix[group]}${String(i + 1).padStart(2, '0')}`;
    const errs = validateStage({ ...x.stage });
    if (errs.length) throw new Error(`${id}: ${errs.join(', ')}`);
    const entry = { id, group, order: i + 1, size: x.stage.size, tiles: rowsOf(x.stage.size, x.stage.tiles), star3: x.stage.star3 };
    if (x.stage.star2 != null) entry.star2 = x.stage.star2;
    stagesOut.push(entry);
    solutions[id] = x.solution;
    reportRows.push({ id, group, order: i + 1, size: x.stage.size, ...x.spec, sol: x.solution, star2: x.stage.star2, star3: x.stage.star3 });
  });
}

console.log('오늘의 도전 판 생성...');
const dailyRaw = generateGroup(DAILY_PLAN, BASE_SEED + 500009, seenForms, log);
// 4일마다 5×5가 한 번 오도록 섞는다
const d4 = dailyRaw.filter((x) => x.spec.size === 4);
const d5 = dailyRaw.filter((x) => x.spec.size === 5);
const dailyOrdered = [];
while (d4.length || d5.length) {
  for (let k = 0; k < 3 && d4.length; k++) dailyOrdered.push(d4.shift());
  if (d5.length) dailyOrdered.push(d5.shift());
}
const dailyOut = dailyOrdered.map((x, i) => {
  const id = `D${String(i + 1).padStart(2, '0')}`;
  solutions[id] = x.solution;
  reportRows.push({ id, group: 'daily', order: i + 1, size: x.stage.size, ...x.spec, sol: x.solution, star2: null, star3: x.stage.star3 });
  return { id, group: 'daily', order: i + 1, size: x.stage.size, tiles: rowsOf(x.stage.size, x.stage.tiles), star3: x.stage.star3 };
});

mkdirSync(resolve(ROOT, 'src/data'), { recursive: true });
mkdirSync(resolve(ROOT, 'tools/out'), { recursive: true });
mkdirSync(resolve(ROOT, 'docs'), { recursive: true });
writeFileSync(resolve(ROOT, 'src/data/stages.json'), `${JSON.stringify({
  contentVersion: CONTENT_VERSION, dailyEpoch: DAILY_EPOCH, stages: stagesOut, daily: dailyOut,
}, null, 2)}\n`);
writeFileSync(resolve(ROOT, 'tools/out/solutions.json'), `${JSON.stringify({
  contentVersion: CONTENT_VERSION, seed: BASE_SEED, solutions,
}, null, 2)}\n`);

// ---------- 보고서 ----------
const groupName = { tutorial: '입문', beginner: '초급', intermediate: '중급', advanced: '고급', daily: '오늘의 도전' };
const lines = [];
lines.push('# 출시 판 목록 / 검증 보고서', '');
lines.push(`- 생성 도구: \`node tools/generate.js --seed ${BASE_SEED}\`${QUICK ? ' --quick' : ''}`);
lines.push(`- 콘텐츠 버전: ${CONTENT_VERSION}`);
lines.push(`- 정규 판 ${stagesOut.length}개(입문 ${TUTORIALS.length} 포함), 오늘의 도전 ${dailyOut.length}개`);
lines.push('- "최단 증명"은 판 상태 공간 BFS가 그 깊이 이전 단계를 모두 펼친 뒤 처음 찾은 해답이라는 뜻이다.');
lines.push('- 미증명 판의 별 기준은 발견한 해답 길이이며 게임에서는 모든 수를 "목표 이동 수"로 표시한다.');
lines.push('- 3별 기준 = 보너스 포함 해답 길이 + 난이도별 여유(초급 1, 중급 1, 고급 0, 일일 1). 보너스 없는 판의 2별 기준 = 3별 기준 + 2.', '');
lines.push('| ID | 난이도 | 순서 | 크기 | 필수 | 보너스 | 방향 타일 | 기본 최단 | 보너스 포함 | 최단 증명(기본/보너스) | 2별 기준 | 3별 기준 | 탐색 상태 수 |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const row of reportRows) {
  const s = row.sol;
  lines.push(`| ${row.id} | ${groupName[row.group]} | ${row.order} | ${row.size}×${row.size} | ${row.req} | ${row.bonus} | ${row.oneway} | ${s.basic.length} | ${s.full ? s.full.length : '-'} | ${s.basicProven ? '예' : '아니오'}/${s.fullProven ? '예' : '아니오'} | ${row.star2 ?? '-'} | ${row.star3 ?? '-'} | ${s.states} |`);
}
lines.push('', '## 생성 통계와 제외 이유', '');
lines.push('| 계획 | 채택 | 시도 | 제외 이유(횟수) |', '|---|---|---|---|');
const rejectName = {
  build: '정답 배치 구성 실패', replay: '역순 해답 재생 실패', duplicate: '회전/반사 중복',
  'too-easy': '너무 쉬움', 'too-hard': '범위보다 김', 'basic-unproven': '제한 안에서 기본 해답 미발견',
  'single-line': '한 줄 반복 풀이', 'single-axis': '한 방향 축만 쓰는 풀이',
  'full-unproven': '제한 안에서 보너스 포함 해답 미증명', 'bonus-too-far': '보너스 해답이 기본보다 4수 이상 김',
};
for (const l of log) {
  const why = Object.entries(l.rejects).map(([k, v]) => `${rejectName[k] || k} ${v}`).join(', ') || '-';
  lines.push(`| ${groupName[l.spec.group]} ${l.spec.size}×${l.spec.size} 필수${l.spec.req} 보너스${l.spec.bonus} 방향${l.spec.oneway} 기본 ${l.spec.min[0]}~${l.spec.min[1]}수 | ${l.made}/${l.spec.count} | ${l.attempts} | ${why} |`);
}
lines.push('', `생성 소요: ${((Date.now() - t0) / 1000).toFixed(1)}초`, '');
writeFileSync(resolve(ROOT, 'docs/STAGE_REPORT.md'), lines.join('\n'));

const short = log.filter((l) => l.made < l.spec.count);
console.log(`완료: 정규 ${stagesOut.length}개, 일일 ${dailyOut.length}개, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
if (short.length) {
  console.log('목표 수량 미달 계획:');
  for (const l of short) console.log(`  ${l.spec.group} ${l.spec.size}x${l.spec.size}: ${l.made}/${l.spec.count}`, l.rejects);
}
