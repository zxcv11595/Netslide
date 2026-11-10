// 출시 판 생성 도구 (개발용).
//   node --max-old-space-size=8192 tools/generate.js [--seed 20261111] [--quick]
//
// 판 구성은 Netslide 방식이다.
//   - 정답 배치는 공급원에서 뻗는 하나의 나무(spanning tree)이고 모든 칸이 그 나무에 속한다.
//     정답과 무관한 수로나 빈 칸은 없다(입문 제외).
//   - 가지 끝(막다른 칸)마다 햄스터가 있고, 모든 햄스터에게 길이 닿으면 완료다. 보너스는 없다.
//   - 난이도는 정답에서 섞은 깊이로 조절하고, 풀이 BFS로 최단 수를 확인한다.
// 순서: 정답 배치 → 합법 이동 셔플 → 역순 해답 보관 → 공통 규칙으로 재생 확인 → 풀이 BFS
//       → 중복/과도한 쉬움 제거 → 난이도·별 기준 지정
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
const CONTENT_VERSION = 1; // 아직 공개 전이라 1을 유지한다. 공개 뒤에 판을 바꾸면 올린다.
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

// ---------- 입문(수작업): 규칙을 하나씩 익히도록 빈 칸을 둔 작은 판 ----------
const TUTORIALS = [
  { id: 'T1', size: 3, tiles: ['p0 p0 g8', 'p0 s2 p0', 'p0 p0 p0'] },
  { id: 'T2', size: 3, tiles: ['g8 p0 p6', 'p0 s1 p0', 'p0 p0 p0'] },
  { id: 'T3', size: 3, tiles: ['p0 p0 g8', 'p0 s6 p0', 'g1 p0 p0'] },
];

// ---------- 생성 계획 ----------
// min: 최단 이동 수 허용 범위. shuffle: 정답에서 섞는 횟수(기본 = min 상한).
// deep: 제한 안에서 해답을 못 찾아도, 확인한 깊이가 min 하한 이상이면 "미증명" 판으로 채택한다.
const PLAN = [
  { group: 'beginner', size: 3, min: [2, 3], count: 3 },
  { group: 'beginner', size: 3, min: [4, 6], shuffle: 8, count: 3 },
  { group: 'beginner', size: 4, min: [3, 4], count: 6 },
  { group: 'intermediate', size: 4, min: [5, 6], count: 8 },
  { group: 'intermediate', size: 5, min: [4, 5], count: 4 },
  { group: 'advanced', size: 4, min: [7, 8], shuffle: 8, deep: true, count: 5 },
  { group: 'advanced', size: 5, min: [6, 99], shuffle: 11, deep: true, count: 6 },
];
const DAILY_PLAN = [
  { group: 'daily', size: 4, min: [5, 6], count: 21 },
  { group: 'daily', size: 5, min: [4, 5], count: 7 },
];
const MAX_STATES = { 3: 200000, 4: 3000000, 5: 2000000 };
const STAR2_EXTRA = 3; // 2별 기준 = 3별 기준 + 3

// ---------- 정답 배치: 모든 칸을 잇는 무작위 나무 ----------
function buildSolved(r, spec) {
  const n = spec.size;
  const total = n * n;
  const src = n === 4 ? pick(r, [5, 6, 9, 10]) : (total - 1) / 2;
  const ports = new Array(total).fill(0);
  const inTree = new Array(total).fill(false);
  inTree[src] = true;
  // 가장 최근 칸에서 이어 갈 확률이 높을수록 길고 구불구불한 굴(가지 적음), 낮을수록 가지 많은 굴
  const windy = 0.35 + r() * 0.55;
  const active = [src];
  let count = 1;
  while (count < total) {
    const i = r() < windy ? active.length - 1 : Math.floor(r() * active.length);
    const u = active[i];
    const options = [];
    for (const d of DIRS) {
      const { dr, dc } = dirDelta(d);
      const vr = Math.floor(u / n) + dr;
      const vc = (u % n) + dc;
      if (vr < 0 || vr >= n || vc < 0 || vc >= n) continue;
      if (!inTree[vr * n + vc]) options.push([d, vr * n + vc]);
    }
    if (!options.length) { active.splice(i, 1); continue; }
    const [d, v] = pick(r, options);
    ports[u] |= d;
    ports[v] |= opposite(d);
    inTree[v] = true;
    active.push(v);
    count++;
  }
  const tiles = ports.map((mask, p) => {
    if (p === src) return { kind: 'source', ports: mask };
    if (DIRS.includes(mask)) return { kind: 'goal', ports: mask, bonus: false }; // 가지 끝 = 햄스터
    return { kind: 'pipe', ports: mask };
  });
  return { tiles, src };
}

// ---------- 회전/반사 중복 판정 ----------
// 공급원 위치를 보존하는 변환에서만 같은 판으로 본다(잠금 줄도 함께 변환된다).
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
  const n = spec.size;
  const probe = { size: n, tiles: solved.tiles };
  const moves = legalMoves(probe);

  // 합법 이동으로 셔플(직전 이동의 역이동은 피한다). N번 셔플이 최소 N수를 뜻하지는 않는다.
  const shuffleLen = spec.shuffle ?? spec.min[1];
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

  // 역순 해답을 공통 규칙으로 재생해 모든 햄스터가 이어지는지 확인
  const rep = replay(stage, known, moveFromCode);
  if (!rep.ok) return { reject: 'replay' };
  if (!evaluateResult(stage, evaluateConnections(stage, rep.cells), known.length).requiredDone) return { reject: 'replay' };

  const form = canonical(n, stage.tiles);
  if (seenForms.has(form)) return { reject: 'duplicate' };

  // 값싼 사전 탐색으로 너무 쉬운 판을 먼저 거른다
  const pre = solve(stage, { maxStates: 20000 });
  if (pre.basic && pre.basic.length < spec.min[0]) return { reject: 'too-easy' };

  const sol = solve(stage, { maxStates: QUICK ? 200000 : MAX_STATES[n] });
  let best;
  let proven;
  if (sol.basic) {
    if (sol.basic.length < spec.min[0]) return { reject: 'too-easy' };
    if (sol.basic.length > spec.min[1]) return { reject: 'too-hard' };
    // 서로 다른 판단: 한 줄만 반복하거나 한 축만 쓰는 풀이는 제외
    const lines = new Set(sol.basic.moves.map((c) => c.slice(0, -1)));
    const axes = new Set(sol.basic.moves.map((c) => c[0]));
    if (lines.size < 2) return { reject: 'single-line' };
    if (sol.basic.length >= 3 && axes.size < 2) return { reject: 'single-axis' };
    best = sol.basic;
    proven = true;
  } else {
    // 제한 안에서 못 찾음: "해답 없음"이 아니라 미증명이다. 알고 있는 해답(역순 셔플)을 목표로 쓴다.
    if (!spec.deep || sol.checkedDepth + 1 < spec.min[0]) return { reject: 'unproven' };
    best = { length: known.length, moves: known };
    proven = false;
  }
  stage.star3 = best.length;
  stage.star2 = best.length + STAR2_EXTRA;
  return {
    stage, form,
    hamsters: stage.tiles.filter((t) => t.kind === 'goal').length,
    solution: {
      basic: best, basicProven: proven, full: best, fullProven: proven,
      lowerBound: proven ? best.length : sol.checkedDepth + 1,
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
    const maxAttempts = 4000;
    while (made < spec.count && attempts < maxAttempts) {
      attempts++;
      const c = tryCandidate(r, spec, seenForms);
      if (c.reject) { rejects[c.reject] = (rejects[c.reject] || 0) + 1; continue; }
      seenForms.add(c.form);
      out.push({ spec, ...c });
      made++;
      const s = c.solution;
      process.stdout.write(`  ${spec.group} ${spec.size}x${spec.size}: ${made}/${spec.count} (햄스터 ${c.hamsters}, ${s.basicProven ? `최단 ${s.basic.length}수` : `최단 ${s.lowerBound}수 이상·발견 ${s.basic.length}수`}, 상태 ${s.states})\n`);
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

TUTORIALS.forEach((t, i) => {
  const stage = { size: t.size, tiles: t.tiles.flatMap((row) => row.split(' ')).map(parseTile), tutorial: true };
  const errs = validateStage(stage);
  if (errs.length) throw new Error(`${t.id}: ${errs.join(', ')}`);
  const sol = solve(stage, { maxStates: 200000 });
  if (!sol.basic || sol.basic.length < 1) throw new Error(`${t.id}: 입문 판 풀이 실패`);
  stagesOut.push({ id: t.id, group: 'tutorial', order: i + 1, size: t.size, tiles: t.tiles });
  solutions[t.id] = { basic: sol.basic, basicProven: true, full: sol.basic, fullProven: true, lowerBound: sol.basic.length, states: sol.states, limitHit: false };
  reportRows.push({ id: t.id, group: 'tutorial', order: i + 1, size: t.size, hamsters: stage.tiles.filter((x) => x.kind === 'goal').length, sol: solutions[t.id], star2: null, star3: null });
  seenForms.add(canonical(t.size, stage.tiles));
});

console.log('정규 판 생성...');
const regular = generateGroup(PLAN, BASE_SEED, seenForms, log);
const prefix = { beginner: 'B', intermediate: 'M', advanced: 'A', daily: 'D' };
for (const group of ['beginner', 'intermediate', 'advanced']) {
  // 표시 순서: 최단 수(미증명은 하한) → 판 크기 → 햄스터 수
  const list = regular.filter((x) => x.spec.group === group).sort((a, b) => a.solution.lowerBound - b.solution.lowerBound
    || a.stage.size - b.stage.size || a.solution.basic.length - b.solution.basic.length || a.hamsters - b.hamsters);
  list.forEach((x, i) => {
    const id = `${prefix[group]}${String(i + 1).padStart(2, '0')}`;
    const errs = validateStage({ ...x.stage });
    if (errs.length) throw new Error(`${id}: ${errs.join(', ')}`);
    stagesOut.push({ id, group, order: i + 1, size: x.stage.size, tiles: rowsOf(x.stage.size, x.stage.tiles), star2: x.stage.star2, star3: x.stage.star3 });
    solutions[id] = x.solution;
    reportRows.push({ id, group, order: i + 1, size: x.stage.size, hamsters: x.hamsters, sol: x.solution, star2: x.stage.star2, star3: x.stage.star3 });
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
  reportRows.push({ id, group: 'daily', order: i + 1, size: x.stage.size, hamsters: x.hamsters, sol: x.solution, star2: x.stage.star2, star3: x.stage.star3 });
  return { id, group: 'daily', order: i + 1, size: x.stage.size, tiles: rowsOf(x.stage.size, x.stage.tiles), star2: x.stage.star2, star3: x.stage.star3 };
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

// 힌트용 해답(게임이 힌트를 쓸 때만 따로 불러온다)
writeFileSync(resolve(ROOT, 'src/data/hints.json'), `${JSON.stringify({
  contentVersion: CONTENT_VERSION, hints: Object.fromEntries(Object.entries(solutions).map(([id, s]) => [id, s.basic.moves])),
})}
`);

// ---------- 보고서 ----------
const groupName = { tutorial: '입문', beginner: '초급', intermediate: '중급', advanced: '고급', daily: '오늘의 도전' };
const lines = [];
lines.push('# 출시 판 목록 / 검증 보고서', '');
lines.push(`- 생성 도구: \`node --max-old-space-size=8192 tools/generate.js --seed ${BASE_SEED}\`${QUICK ? ' --quick' : ''}`);
lines.push(`- 콘텐츠 버전: ${CONTENT_VERSION}`);
lines.push(`- 정규 판 ${stagesOut.length}개(입문 ${TUTORIALS.length} 포함), 오늘의 도전 ${dailyOut.length}개`);
lines.push('- 판 구성: 모든 칸이 하나의 굴(나무 구조)에 속하고, 가지 끝마다 햄스터가 있다. 모든 햄스터에게 길이 닿으면 완료. 보너스 없음.');
lines.push('- "증명"은 판 상태 공간 BFS가 그 깊이 이전 단계를 모두 펼친 뒤 처음 찾은 해답이라는 뜻이다.');
lines.push('- 미증명 판은 탐색 제한 안에서 해답을 찾지 못한 판이다. "최단 N수 이상"까지만 확인했고, 별 기준은 생성할 때 알고 있던 해답 길이다.');
lines.push(`- 3별 기준 = 최단 수(미증명은 발견한 해답 길이), 2별 기준 = 3별 기준 + ${STAR2_EXTRA}. 게임에서는 모든 수를 "목표"로 표시한다.`, '');
lines.push('| ID | 난이도 | 순서 | 크기 | 햄스터 | 최단 수 | 증명 | 3별 기준 | 2별 기준 | 탐색 상태 수 |');
lines.push('|---|---|---|---|---|---|---|---|---|---|');
for (const row of reportRows) {
  const s = row.sol;
  lines.push(`| ${row.id} | ${groupName[row.group]} | ${row.order} | ${row.size}×${row.size} | ${row.hamsters} | ${s.basicProven ? s.basic.length : `${s.lowerBound} 이상 (발견 ${s.basic.length})`} | ${s.basicProven ? '예' : '아니오'} | ${row.star3 ?? '-'} | ${row.star2 ?? '-'} | ${s.states} |`);
}
lines.push('', '## 생성 통계와 제외 이유', '');
lines.push('| 계획 | 채택 | 시도 | 제외 이유(횟수) |', '|---|---|---|---|');
const rejectName = {
  replay: '역순 해답 재생 실패', duplicate: '회전/반사 중복', 'too-easy': '너무 쉬움', 'too-hard': '범위보다 김',
  unproven: '제한 안에서 해답 미발견', 'single-line': '한 줄 반복 풀이', 'single-axis': '한 방향 축만 쓰는 풀이',
};
for (const l of log) {
  const why = Object.entries(l.rejects).map(([k, v]) => `${rejectName[k] || k} ${v}`).join(', ') || '-';
  lines.push(`| ${groupName[l.spec.group]} ${l.spec.size}×${l.spec.size} 최단 ${l.spec.min[0]}~${l.spec.min[1] === 99 ? '' : l.spec.min[1]}수${l.spec.deep ? ' (미증명 허용)' : ''} | ${l.made}/${l.spec.count} | ${l.attempts} | ${why} |`);
}
lines.push('', `생성 소요: ${((Date.now() - t0) / 1000).toFixed(1)}초`, '');
writeFileSync(resolve(ROOT, 'docs/STAGE_REPORT.md'), lines.join('\n'));

const short = log.filter((l) => l.made < l.spec.count);
console.log(`완료: 정규 ${stagesOut.length}개, 일일 ${dailyOut.length}개, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
if (short.length) {
  console.log('목표 수량 미달 계획:');
  for (const l of short) console.log(`  ${l.spec.group} ${l.spec.size}x${l.spec.size}: ${l.made}/${l.spec.count}`, l.rejects);
}
