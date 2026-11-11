// 출시 판 생성 도구 (개발용).
//   node --max-old-space-size=8192 tools/generate.js [--seed 20261111] [--quick]
//
// 판 구성은 Netslide 방식이다.
//   - 정답 배치는 가운데(햄스터)에서 뻗는 하나의 나무이고, 도토리는 가지 끝에 있다.
//   - 모든 도토리에 길이 닿으면 성공이다. 정답은 여러 개여도 된다(최단 경로는 풀이 탐색으로 다시 잰다).
//   - 빈 블록: 길이 없는 칸. 난이도 안에서 뒤로 갈수록 2개 → 1개 → 0개로 줄어든다.
//   - 가짜 길(2026-11-11 추가): 정답에 쓰이지 않는 길. 뒤쪽 판에만 섞는다. 세 종류가 있다.
//       떨어진 조각(stray) 나무 밖 칸에 놓인 길 조각 / 곁가지(spur) 진짜 길에 붙은 끊긴 가지 / 빈 끝(stub) 도토리가 없는 가지 끝
//   - 난이도는 정답에서 섞은 깊이로 조절하고, 풀이 BFS로 최단 수를 확인한다.
// 순서: 정답 배치 → 합법 이동 셔플 → 역순 해답 보관 → 공통 규칙으로 재생 확인 → 풀이 BFS
//       → 중복/과도한 쉬움 제거 → 난이도·별 기준 지정
// 출력:
//   src/data/stages.json        게임이 읽는 판 데이터(해답 없음)
//   tools/out/solutions.json    개발용 검증 자료(해답·탐색량)
//   docs/STAGE_REPORT.md        판 목록/검증 보고서
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  N, E, S, W, DIRS, opposite, dirDelta, parseTile, tileCode, legalMoves, shiftBoard,
  inverseMove, moveToCode, moveFromCode, evaluateConnections, evaluateResult, validateStage,
} from '../src/core/rules.js';
import { solve, replay } from '../src/core/solver.js';
import { star3For, star2For, TUTORIAL_STAR2_EXTRA } from '../src/core/stars.js';
import { planHint } from '../src/game/hint.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const BASE_SEED = Number(argOf('--seed', 20261111));
const QUICK = args.includes('--quick');
// --groups beginner,daily 처럼 주면 그 묶음만 새로 만들고, 나머지는 지금 있는 판을 그대로 둔다(입문은 항상 다시 만든다).
// 그대로 둔 판 가운데 보관 해답이 새 규칙으로 끝나지 않는 판은 다시 풀어서 최단 경로와 별 기준만 고친다.
const ONLY = argOf('--groups', '') ? new Set(String(argOf('--groups', '')).split(',')) : null;
const want = (g) => !ONLY || ONLY.has(g);
const CONTENT_VERSION = 2; // 판을 바꾸면 올린다. 2026-11-12: 새 규칙(모든 길 연결)·빈 블록 없음·십자 조각 없음으로 전체를 다시 만들며 2로 올렸다(예전 기록은 시작할 때 지운다).
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

// ---------- 입문(수작업): 2×2. 줄 하나를 밀면 두 칸이 자리를 바꾸는 가장 작은 판 ----------
const TUTORIALS = [
  { id: 'T1', size: 2, tiles: ['s2 g1', 'p0 p12'] }, // 세로줄 한 번: 끊어진 길 한 조각과 도토리를 잇는다
  { id: 'T2', size: 2, tiles: ['s4 p0', 'g8 p3'] }, // 가로줄 한 번
  { id: 'T3', size: 2, tiles: ['s6 g1', 'p0 g8'] }, // 두 도토리, 두 번 (2026-11-12 사용자 지정: 2×2 유지)
];

// ---------- 생성 계획 ----------
// min: 최단 이동 수 허용 범위. shuffle: 정답에서 섞는 횟수(기본 = min 상한).
// deep: 제한 안에서 해답을 못 찾아도, 확인한 깊이가 min 하한 이상이면 "미증명" 판으로 채택한다.
// 난이도는 판 크기로 나눈다: 초급 3×3, 중급 4×4, 고급 5×5. (익스트림은 나중에 추가)
// windy: 굴이 구불구불한 정도의 범위(1에 가까울수록 가지가 적다). 햄스터가 적은 단계에 쓴다.
// ham: 햄스터 수 허용 범위. 중급과 고급도 1마리부터 시작한다. 단계가 올라갈수록 이동 수와 햄스터 수가 함께 늘도록 단계마다 범위를 준다.
// 판 수(2026-11-11): 초급 20, 중급 40, 고급 68. 도토리는 초급 1~5, 중급 1~7, 고급 2~9개(고급에는 1개짜리 판을 두지 않는다).
// 판은 단계 순서대로 놓이므로 뒤로 갈수록 어려워진다.
const PLAN = [
  // 최단 수가 한 수씩 올라간다(초급 2~7, 중급 3~9, 고급 4~14). 햄스터 수는 단계마다 범위를 주어 대체로 함께 늘어난다.
  // blanks: 길이 없는 빈 블록(p0) 개수 범위. 2026-11-12부터 원작 Netslide처럼 빈 블록은 쓰지 않는다(모두 [0, 0]).
  // 2026-11-11 결정: 원작 Netslide처럼 가짜 길은 쓰지 않는다. 그래서 decoys는 모두 [0, 0]이다(만드는 코드는 남겨 두었다).
  // decoys: 가짜 길 개수 범위. sneaky: 진짜 길에 붙은 곁가지·빈 끝을 더 많이 섞는다(고급 뒤쪽).
  // 빈 블록과 떨어진 조각을 합쳐 판의 4분의 1을 넘지 않는다.
  { group: 'beginner', size: 3, min: [2, 2], ham: [1, 2], blanks: [0, 0], decoys: [0, 0], count: 3 },
  { group: 'beginner', size: 3, min: [3, 3], ham: [1, 3], blanks: [0, 0], decoys: [0, 0], count: 3 },
  { group: 'beginner', size: 3, min: [4, 4], ham: [2, 3], blanks: [0, 0], decoys: [0, 0], count: 4 },
  { group: 'beginner', size: 3, min: [5, 5], ham: [2, 4], blanks: [0, 0], decoys: [0, 0], count: 4 },
  { group: 'beginner', size: 3, min: [6, 6], ham: [3, 5], blanks: [0, 0], decoys: [0, 0], count: 3 },
  { group: 'beginner', size: 3, min: [7, 7], ham: [3, 5], blanks: [0, 0], decoys: [0, 0], count: 3 },
  { group: 'intermediate', size: 4, min: [3, 3], ham: [1, 2], windy: [0.9, 1], blanks: [0, 0], decoys: [0, 0], count: 3 },
  { group: 'intermediate', size: 4, min: [4, 4], ham: [2, 3], blanks: [0, 0], decoys: [0, 0], count: 5 },
  { group: 'intermediate', size: 4, min: [5, 5], ham: [2, 4], blanks: [0, 0], decoys: [0, 0], count: 6 },
  { group: 'intermediate', size: 4, min: [6, 6], ham: [3, 5], blanks: [0, 0], decoys: [0, 0], count: 6 },
  { group: 'intermediate', size: 4, min: [6, 7], shuffle: 7, deep: true, ham: [4, 6], blanks: [0, 0], decoys: [0, 0], count: 6 },
  { group: 'intermediate', size: 4, min: [7, 8], shuffle: 8, deep: true, ham: [5, 7], blanks: [0, 0], decoys: [0, 0], count: 7 },
  { group: 'intermediate', size: 4, min: [8, 9], shuffle: 9, deep: true, ham: [5, 7], blanks: [0, 0], decoys: [0, 0], count: 7 },
  { group: 'advanced', size: 5, min: [4, 4], ham: [2, 3], windy: [0.8, 1], blanks: [0, 0], decoys: [0, 0], count: 4 },
  { group: 'advanced', size: 5, min: [5, 5], ham: [2, 4], blanks: [0, 0], decoys: [0, 0], count: 4 },
  { group: 'advanced', size: 5, min: [6, 6], ham: [3, 4], blanks: [0, 0], decoys: [0, 0], count: 5 },
  { group: 'advanced', size: 5, min: [6, 7], shuffle: 7, deep: true, ham: [3, 5], blanks: [0, 0], decoys: [0, 0], count: 5 },
  { group: 'advanced', size: 5, min: [7, 8], shuffle: 8, deep: true, ham: [4, 6], blanks: [0, 0], decoys: [0, 0], count: 6 },
  { group: 'advanced', size: 5, min: [8, 9], shuffle: 9, deep: true, ham: [4, 6], blanks: [0, 0], decoys: [0, 0], count: 6 },
  { group: 'advanced', size: 5, min: [9, 10], shuffle: 10, deep: true, ham: [5, 7], blanks: [0, 0], decoys: [0, 0], count: 6 },
  { group: 'advanced', size: 5, min: [10, 11], shuffle: 11, deep: true, ham: [5, 7], blanks: [0, 0], decoys: [0, 0], count: 6 },
  { group: 'advanced', size: 5, min: [11, 12], shuffle: 12, deep: true, ham: [6, 8], blanks: [0, 0], decoys: [0, 0], count: 8 },
  { group: 'advanced', size: 5, min: [12, 13], shuffle: 13, deep: true, ham: [7, 9], blanks: [0, 0], decoys: [0, 0], count: 9 },
  { group: 'advanced', size: 5, min: [13, 14], shuffle: 14, deep: true, ham: [7, 9], blanks: [0, 0], decoys: [0, 0], count: 9 },
];
// 오늘의 도전(2026-11-12): 1년 치. 평일은 4×4(최단 5~7번), 토·일은 5×5(최단 6~8번).
// 실제로는 --daily-part 로 여러 프로세스가 나눠 만들고 tools/merge-daily.js 가 날짜에 맞춰 합친다.
const DAILY_PLAN = [
  { group: 'daily', size: 4, min: [5, 5], blanks: [0, 0], decoys: [0, 0], count: 88 },
  { group: 'daily', size: 4, min: [6, 6], blanks: [0, 0], decoys: [0, 0], count: 87 },
  { group: 'daily', size: 4, min: [7, 7], shuffle: 7, deep: true, blanks: [0, 0], decoys: [0, 0], count: 87 },
  { group: 'daily', size: 5, min: [6, 6], ham: [3, 6], blanks: [0, 0], decoys: [0, 0], count: 35 },
  { group: 'daily', size: 5, min: [7, 7], shuffle: 7, deep: true, ham: [3, 6], blanks: [0, 0], decoys: [0, 0], count: 35 },
  { group: 'daily', size: 5, min: [8, 8], shuffle: 8, deep: true, ham: [4, 7], blanks: [0, 0], decoys: [0, 0], count: 34 },
];
// --daily-part i/k : 오늘의 도전만, 계획표의 판 수를 k로 나눠(여유 5%) i번째 몫을 만들어 tools/out/daily-parts/part-i.json 에 쓰고 끝낸다
const DAILY_PART = argOf('--daily-part', '') ? String(argOf('--daily-part', '')).split('/').map(Number) : null;
if (DAILY_PART) {
  const [pi, pk] = DAILY_PART;
  for (const spec of DAILY_PLAN) spec.count = Math.ceil((spec.count * 1.05) / pk);
  DAILY_PLAN.partSeed = pi * 104729;
}
const MAX_STATES = { 3: 200000, 4: 3000000, 5: 2000000 };
// 별 기준은 src/core/stars.js 한곳에서 정한다(3별 = 최단 + 최단/4 올림, 2별 = 3별 + 3)
const MAX_HAMSTERS = 9; // 한 판의 도토리(가지 끝) 수 상한. 4×4는 계획표에서 7까지만 쓴다

// ---------- 정답 배치: 모든 칸을 잇는 무작위 나무 ----------
// 원작 Netslide처럼 네 방향 십자 조각은 만들지 않는다(세 갈래까지). 나무가 막히면 처음부터 다시 만든다.
function buildSolved(r, spec) {
  for (let i = 0; i < 200; i++) {
    const out = buildSolvedOnce(r, spec);
    if (out) return out;
  }
  throw new Error('정답 배치를 만들지 못함');
}
const bitCount = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
function buildSolvedOnce(r, spec) {
  const n = spec.size;
  const total = n * n;
  const src = n === 4 ? pick(r, [5, 6, 9, 10]) : (total - 1) / 2;
  const ports = new Array(total).fill(0);
  const inTree = new Array(total).fill(false);
  inTree[src] = true;
  // 가장 최근 칸에서 이어 갈 확률이 높을수록 길고 구불구불한 굴(가지 적음), 낮을수록 가지 많은 굴
  // 햄스터가 적은 단계는 가지가 거의 없는 굴이 필요하므로 계획표에서 범위를 따로 준다
  const [w0, w1] = spec.windy || [0.35, 0.9];
  const windy = w0 + r() * (w1 - w0);
  const active = [src];
  const between = ([a, b]) => a + Math.floor(r() * (b - a + 1));
  const blanks = spec.blanks ? between(spec.blanks) : 0;
  // 가짜 길을 종류별로 나눈다. 떨어진 조각은 칸을 차지하므로 빈 블록과 합쳐 판의 4분의 1까지만 둔다.
  const want = spec.decoys ? between(spec.decoys) : 0;
  const kinds = { stray: 0, spur: 0, stub: 0 };
  const strayRoom = Math.max(0, Math.floor(total / 4) - blanks);
  for (let i = 0; i < want; i++) {
    const x = r();
    let kind = spec.sneaky ? (x < 0.3 ? 'stray' : x < 0.7 ? 'spur' : 'stub') : (x < 0.6 ? 'stray' : 'spur');
    if (kind === 'stray' && kinds.stray >= strayRoom) kind = 'spur';
    kinds[kind]++;
  }
  const target = total - blanks - kinds.stray;
  let count = 1;
  while (count < target) {
    if (!active.length) return null; // 남은 칸에 닿을 수 있는 길 끝이 없다(세 갈래 제한 때문에 막힘)
    const i = r() < windy ? active.length - 1 : Math.floor(r() * active.length);
    const u = active[i];
    if (bitCount(ports[u]) >= 3) { active.splice(i, 1); continue; } // 세 갈래가 된 칸에서는 더 뻗지 않는다
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
  // ----- 가짜 길 -----
  let decoys = 0;
  const shuffled = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // 빈 끝: 가지 끝 몇 곳은 도토리 없이 길만 둔다(도토리 수가 단계 하한 아래로 내려가지 않게)
  const leaves = shuffled([...ports.keys()].filter((p) => p !== src && DIRS.includes(ports[p])));
  const minGoals = Math.max(1, spec.ham ? spec.ham[0] : 1);
  const stubs = new Set(leaves.slice(0, Math.max(0, Math.min(kinds.stub, leaves.length - minGoals))));
  decoys += stubs.size;
  // 곁가지: 진짜 길(가운데·가지 끝 제외)에 어디에도 이어지지 않는 가지를 하나 더 낸다
  const spurCells = shuffled([...ports.keys()].filter((p) => p !== src && inTree[p] && !DIRS.includes(ports[p]) && ports[p] !== 15));
  for (const p of spurCells.slice(0, kinds.spur + (kinds.stub - stubs.size))) {
    const free = DIRS.filter((d) => !(ports[p] & d));
    ports[p] |= pick(r, free);
    decoys++;
  }
  // 떨어진 조각: 나무 밖 칸에 길 조각(곧은 길·꺾인 길·세 갈래)을 놓는다
  const PIECES = [N | S, E | W, N | E, E | S, S | W, W | N, N | E | S, E | S | W, S | W | N, W | N | E];
  for (const p of shuffled([...ports.keys()].filter((q) => !inTree[q])).slice(0, kinds.stray)) {
    ports[p] = pick(r, PIECES);
    decoys++;
  }
  const tiles = ports.map((mask, p) => {
    if (p === src) return { kind: 'source', ports: mask };
    if (inTree[p] && DIRS.includes(mask) && !stubs.has(p)) return { kind: 'goal', ports: mask, bonus: false }; // 가지 끝 = 도토리
    return { kind: 'pipe', ports: mask };
  });
  return { tiles, src, decoys };
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
  const hamCount = solved.tiles.filter((t) => t.kind === 'goal').length;
  if (hamCount > MAX_HAMSTERS) return { reject: 'too-many-hamsters' };
  if (spec.ham && (hamCount < spec.ham[0] || hamCount > spec.ham[1])) return { reject: 'hamster-range' };
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
    if (!spec.deep || sol.checkedDepth + 1 < Math.min(spec.min[0], 6)) return { reject: 'unproven' }; // 탐색이 닿은 깊이가 6 미만이면 너무 쉬운 판일 수 있어 버린다
    best = { length: known.length, moves: known };
    proven = false;
    // 섞은 순서를 거꾸로 한 해답은 길 때가 많다. 양쪽 탐색으로 더 짧은 해답을 한 번 더 찾아 별 기준을 조인다.
    const cells0 = Array.from({ length: n * n }, (_, i) => i);
    const shorter = planHint(stage, cells0, [], known, { maxStates: QUICK ? 60000 : 600000, backDepth: n >= 5 ? 5 : 6 });
    if (shorter.type === 'path' && shorter.moves.length < best.length) {
      const again = replay(stage, shorter.moves, moveFromCode);
      if (again.ok && evaluateResult(stage, evaluateConnections(stage, again.cells), shorter.moves.length).requiredDone) {
        best = { length: shorter.moves.length, moves: shorter.moves };
      }
    }
  }
  if (best.length < spec.min[0] || best.length > spec.min[1]) return { reject: 'length-range' };
  stage.shortest = best.length;
  stage.star3 = star3For(best.length);
  stage.star2 = star2For(best.length);
  return {
    stage, form,
    hamsters: stage.tiles.filter((t) => t.kind === 'goal').length,
    blanks: stage.tiles.filter((t) => t.kind === 'pipe' && t.ports === 0).length,
    decoys: solved.decoys,
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
    if (!want(spec.group)) return; // 난수는 단계 번호로 정하므로 건너뛰어도 다른 단계의 결과는 같다
    const r = rng(seedBase + si * 7919);
    const rejects = {};
    let made = 0;
    let attempts = 0;
    const budgetMs = 240000; // 단계마다 최대 4분. 넘으면 만든 만큼만 두고 다음 단계로 간다
    const stepStart = Date.now();
    const maxAttempts = 30000; // 햄스터 범위 밖 후보는 값싸게 걸러지므로 넉넉히 둔다
    while (made < spec.count && attempts < maxAttempts && Date.now() - stepStart < budgetMs) {
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
  const stage = { size: t.size, tiles: t.tiles.flatMap((row) => row.split(' ')).map(parseTile), tutorial: true, star3: 1, star2: 4 };
  const errs = validateStage(stage);
  if (errs.length) throw new Error(`${t.id}: ${errs.join(', ')}`);
  const sol = solve(stage, { maxStates: 200000 });
  if (!sol.basic || sol.basic.length < 1) throw new Error(`${t.id}: 입문 판 풀이 실패`);
  stage.shortest = sol.basic.length;
  stage.star3 = sol.basic.length; // 입문은 여유 없이 최단 그대로
  stage.star2 = stage.star3 + TUTORIAL_STAR2_EXTRA;
  stagesOut.push({ id: t.id, group: 'tutorial', order: i + 1, size: t.size, tiles: t.tiles, shortest: stage.shortest, star3: stage.star3, star2: stage.star2 });
  solutions[t.id] = { basic: sol.basic, basicProven: true, full: sol.basic, fullProven: true, lowerBound: sol.basic.length, states: sol.states, limitHit: false };
  reportRows.push({ id: t.id, group: 'tutorial', order: i + 1, size: t.size, hamsters: stage.tiles.filter((x) => x.kind === 'goal').length, sol: solutions[t.id], star2: stage.star2, star3: stage.star3 });
  seenForms.add(canonical(t.size, stage.tiles));
});

console.log('정규 판 생성...');
const regular = generateGroup(PLAN, BASE_SEED, seenForms, log);
const prefix = { beginner: 'B', intermediate: 'M', advanced: 'A', daily: 'D' };
// 그대로 두는 판: 지금 자료에서 가져오고, 새 규칙으로 보관 해답이 끝나지 않으면 다시 푼다
const prev = ONLY ? {
  data: JSON.parse(readFileSync(resolve(ROOT, 'src/data/stages.json'), 'utf8')),
  sols: JSON.parse(readFileSync(resolve(ROOT, 'tools/out/solutions.json'), 'utf8')).solutions,
} : null;
const needRegen = [];
function carry(raw) {
  const stage = { size: raw.size, tiles: raw.tiles.flatMap((row) => row.split(' ')).map(parseTile), tutorial: false, star2: raw.star2, star3: raw.star3 };
  let sol = prev.sols[raw.id];
  let out = raw;
  const rep = replay(stage, sol.basic.moves, moveFromCode);
  if (!rep.ok || !evaluateResult(stage, evaluateConnections(stage, rep.cells), sol.basic.length).requiredDone) {
    const again = solve(stage, { maxStates: 30000000, deadline: Date.now() + 420000 });
    if (again.basic) {
      out = { ...raw, shortest: again.basic.length, star2: star2For(again.basic.length), star3: star3For(again.basic.length) };
      sol = { basic: again.basic, basicProven: true, full: again.basic, fullProven: true, lowerBound: again.basic.length, states: again.states, limitHit: false };
      console.log(`  ${raw.id}: 새 규칙으로 다시 풂 — 최단 ${raw.shortest} → ${again.basic.length}`);
    } else {
      needRegen.push(raw.id);
      console.log(`  ${raw.id}: 새 규칙의 해답을 제한 안에 찾지 못함(전체 재생성 때 바뀐다)`);
    }
  }
  solutions[raw.id] = sol;
  const kinds = stage.tiles;
  reportRows.push({ id: raw.id, group: raw.group, order: raw.order, size: raw.size, hamsters: kinds.filter((x) => x.kind === 'goal').length,
    blanks: kinds.filter((x) => x.kind === 'pipe' && !x.ports).length, decoys: 0, sol, star2: out.star2, star3: out.star3 });
  return out;
}
for (const group of ['beginner', 'intermediate', 'advanced']) {
  if (!want(group)) { for (const raw of prev.data.stages.filter((x) => x.group === group)) stagesOut.push(carry(raw)); continue; }
  // 표시 순서: 별 3개 기준 이동 수 → 햄스터 수 → 단계. 이동 수는 뒤로 갈수록 줄어들지 않는다.
  const list = regular.filter((x) => x.spec.group === group).sort((a, b) => a.solution.basic.length - b.solution.basic.length
    || a.hamsters - b.hamsters || PLAN.indexOf(a.spec) - PLAN.indexOf(b.spec));
  list.forEach((x, i) => {
    const id = `${prefix[group]}${String(i + 1).padStart(2, '0')}`;
    const errs = validateStage({ ...x.stage });
    if (errs.length) throw new Error(`${id}: ${errs.join(', ')}`);
    stagesOut.push({ id, group, order: i + 1, size: x.stage.size, tiles: rowsOf(x.stage.size, x.stage.tiles), shortest: x.stage.shortest, star2: x.stage.star2, star3: x.stage.star3 });
    solutions[id] = x.solution;
    reportRows.push({ id, group, order: i + 1, size: x.stage.size, hamsters: x.hamsters, blanks: x.blanks, decoys: x.decoys, sol: x.solution, star2: x.stage.star2, star3: x.stage.star3 });
  });
}

console.log('오늘의 도전 판 생성...');
const dailyRaw = want('daily') ? generateGroup(DAILY_PLAN, BASE_SEED + 500009 + (DAILY_PLAN.partSeed || 0), seenForms, log) : [];
if (DAILY_PART) {
  mkdirSync(resolve(ROOT, 'tools/out/daily-parts'), { recursive: true });
  const items = dailyRaw.map((x) => ({
    size: x.stage.size, tiles: rowsOf(x.stage.size, x.stage.tiles), shortest: x.stage.shortest, star2: x.stage.star2, star3: x.stage.star3,
    hamsters: x.hamsters, form: x.form, solution: x.solution,
  }));
  writeFileSync(resolve(ROOT, `tools/out/daily-parts/part-${DAILY_PART[0]}.json`), JSON.stringify(items));
  console.log(`오늘의 도전 몫 ${DAILY_PART[0]}/${DAILY_PART[1]}: ${items.length}판, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  process.exit(0);
}
// 4일마다 5×5가 한 번 오도록 섞는다
const d4 = dailyRaw.filter((x) => x.spec.size === 4);
const d5 = dailyRaw.filter((x) => x.spec.size === 5);
const dailyOrdered = [];
while (d4.length || d5.length) {
  for (let k = 0; k < 3 && d4.length; k++) dailyOrdered.push(d4.shift());
  if (d5.length) dailyOrdered.push(d5.shift());
}
const dailyOut = !want('daily') ? prev.data.daily.map(carry) : dailyOrdered.map((x, i) => {
  const id = `D${String(i + 1).padStart(2, '0')}`;
  solutions[id] = x.solution;
  reportRows.push({ id, group: 'daily', order: i + 1, size: x.stage.size, hamsters: x.hamsters, blanks: x.blanks, decoys: x.decoys, sol: x.solution, star2: x.stage.star2, star3: x.stage.star3 });
  return { id, group: 'daily', order: i + 1, size: x.stage.size, tiles: rowsOf(x.stage.size, x.stage.tiles), shortest: x.stage.shortest, star2: x.stage.star2, star3: x.stage.star3 };
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
lines.push('- 판 구성: 가운데 햄스터에서 뻗는 나무 길의 가지 끝마다 도토리가 있다. 모든 길 조각이 햄스터와 이어지면 성공(원작 Netslide 방식). 빈 블록은 뒤로 갈수록 줄고(2 → 0), 가짜 길은 없다.');
lines.push('- "증명"은 판 상태 공간 BFS가 그 깊이 이전 단계를 모두 펼친 뒤 처음 찾은 해답이라는 뜻이다.');
lines.push('- 미증명 판은 탐색 제한 안에서 해답을 찾지 못한 판이다. "최단 N수 이상"까지만 확인했고, 별 기준은 생성할 때 알고 있던 해답 길이다.');
lines.push('- 3별 기준 = 최단 수(미증명은 발견한 해답 길이)의 2배, 2별 기준 = 3배. 입문은 3별 = 최단 수 그대로, 2별 = 3별 + 3.', '');
lines.push('| ID | 난이도 | 순서 | 크기 | 도토리 | 빈 블록 | 가짜 길 | 최단 수 | 증명 | 3별 기준 | 2별 기준 | 탐색 상태 수 |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const row of reportRows) {
  const s = row.sol;
  lines.push(`| ${row.id} | ${groupName[row.group]} | ${row.order} | ${row.size}×${row.size} | ${row.hamsters} | ${row.blanks ?? 0} | ${row.decoys ?? 0} | ${s.basicProven ? s.basic.length : `${s.lowerBound} 이상 (발견 ${s.basic.length})`} | ${s.basicProven ? '예' : '아니오'} | ${row.star3 ?? '-'} | ${row.star2 ?? '-'} | ${s.states} |`);
}
lines.push('', '## 생성 통계와 제외 이유', '');
lines.push('| 계획 | 채택 | 시도 | 제외 이유(횟수) |', '|---|---|---|---|');
const rejectName = {
  replay: '역순 해답 재생 실패', 'too-many-hamsters': '도토리 10개 이상', 'hamster-range': '햄스터 수가 단계 범위 밖', duplicate: '회전/반사 중복', 'too-easy': '너무 쉬움', 'too-hard': '범위보다 김',
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
if (needRegen.length) console.log(`새 규칙의 해답을 못 찾은 판(전체 재생성 필요): ${needRegen.join(', ')}`);
if (short.length) {
  console.log('목표 수량 미달 계획:');
  for (const l of short) console.log(`  ${l.spec.group} ${l.spec.size}x${l.spec.size}: ${l.made}/${l.spec.count}`, l.rejects);
}
