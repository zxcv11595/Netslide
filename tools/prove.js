// 미증명 판의 최단 경로 증명 도구 (2026-11-12)
//
// 방법(양쪽에서 만나기):
//   1) 목표 배치를 모두 찾는다. 성공 = 모든 길 조각이 햄스터와 이어짐인데, 정답 나무의 길 끝 수가 딱 맞으므로
//      성공한 배치는 "모든 길 끝이 이웃과 맞물리고 판 밖을 향한 끝이 없는 배치"와 같다. 이것을 칸마다 맞춰 보며 전부 찾는다.
//   2) 목표 배치들에서 거꾸로 b수까지 넓이 우선으로 펼쳐 표(배치 → 남은 수)를 만든다.
//   3) 시작 배치에서 앞으로 a수까지 깊이 우선으로 훑으며(배치는 저장하지 않는다) 표에 있는 배치를 만나면
//      "앞 k수 + 표의 남은 수"가 해답 길이다. a + b = (알려진 길이 - 1)이면 그보다 짧은 해답이 있는지 빠짐없이 확인된다.
//   같은 축의 줄 이동은 서로 바뀌어도 결과가 같으므로 줄 번호 순서로만 훑고, 되돌리기·같은 줄 반 바퀴 넘는 반복은 건너뛴다
//   (가장 짧은 해답은 언제나 이런 정리된 순서로 쓸 수 있으므로 빠지는 해답이 없다).
//
// 쓰기: node --max-old-space-size=8192 tools/prove.js [--ids A14,A15] [--back 6] [--slots 26] [--out tools/out/proofs]
//   결과는 판마다 tools/out/proofs/<ID>.json 에 남는다: { id, known, shortest, proven: true, moves, back, fwd, goals, table, seconds }
//   이미 결과 파일이 있는 판은 건너뛴다(--force 로 다시).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tileCode, tilePorts, sourcePos, evaluateConnections, evaluateResult, moveFromCode } from '../src/core/rules.js';
import { replay } from '../src/core/solver.js';
import { parseContent } from '../src/data/parse.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const OUT = resolve(ROOT, argOf('--out', 'tools/out/proofs'));
const FORCE = args.includes('--force');
mkdirSync(OUT, { recursive: true });

const raw = JSON.parse(readFileSync(resolve(ROOT, 'src/data/stages.json'), 'utf8'));
const sols = JSON.parse(readFileSync(resolve(ROOT, 'tools/out/solutions.json'), 'utf8')).solutions;
const content = parseContent(raw);
const allStages = [...content.byId.values()];
const ids = argOf('--ids', '') ? argOf('--ids', '').split(',') : allStages.filter((s) => sols[s.id] && !sols[s.id].basicProven).map((s) => s.id);

// ---------- 열린 주소 해시 표: 배치(4비트씩 묶은 32비트 낱말 W개) → 남은 수 ----------
function makeTable(slotsLog2, W) {
  const cap = 2 ** slotsLog2;
  const mask = cap - 1;
  const keys = new Uint32Array(cap * W);
  const dist = new Uint8Array(cap).fill(255);
  let size = 0;
  const hash = (k, o) => {
    let h = 0x9e3779b1;
    for (let i = 0; i < W; i++) { h = Math.imul(h ^ k[o + i], 0x85ebca6b); h ^= h >>> 13; }
    h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  };
  return {
    get size() { return size; }, cap,
    // 있으면 남은 수, 없으면 -1
    get(k, o = 0) {
      let i = hash(k, o) & mask;
      for (;;) {
        if (dist[i] === 255) return -1;
        let eq = true;
        for (let w = 0; w < W; w++) if (keys[i * W + w] !== k[o + w]) { eq = false; break; }
        if (eq) return dist[i];
        i = (i + 1) & mask;
      }
    },
    // 새로 넣었으면 true
    add(k, o, d) {
      if (size > cap * 0.7) throw new Error(`표가 가득 참(${size}). --slots 를 늘리거나 --back 을 줄이세요`);
      let i = hash(k, o) & mask;
      for (;;) {
        if (dist[i] === 255) {
          for (let w = 0; w < W; w++) keys[i * W + w] = k[o + w];
          dist[i] = d; size++;
          return true;
        }
        let eq = true;
        for (let w = 0; w < W; w++) if (keys[i * W + w] !== k[o + w]) { eq = false; break; }
        if (eq) return false;
        i = (i + 1) & mask;
      }
    },
  };
}

const GROW = 13; // 거꾸로 한 층 펼칠 때 늘어나는 배수(실측 약 12~13)
function proveStage(stage, known, backDepth, slotsLog2, budget) {
  const t0 = Date.now();
  const n = stage.size;
  const total = n * n;
  const W = Math.ceil(total / 8);
  // 타일 종류 번호(같은 종류는 구분하지 않는다)와 종류별 길 끝
  const codeIdx = new Map();
  const typeOf = stage.tiles.map((t) => { const c = tileCode(t); if (!codeIdx.has(c)) codeIdx.set(c, codeIdx.size); return codeIdx.get(c); });
  if (codeIdx.size > 16) throw new Error('타일 종류가 16개를 넘음');
  const portsOfType = new Array(codeIdx.size);
  stage.tiles.forEach((t, i) => { portsOfType[typeOf[i]] = tilePorts(t); });
  const sp = sourcePos(stage);
  const srcType = typeOf[sp];

  // 이동: 잠기지 않은 줄마다 두 방향. 칸 바꾸기 표로 미리 만든다.
  const moves = [];
  for (const axis of ['row', 'col']) {
    for (let index = 0; index < n; index++) {
      if (axis === 'row' ? Math.floor(sp / n) === index : sp % n === index) continue;
      for (const dir of [1, -1]) {
        const from = new Int8Array(total);
        for (let p = 0; p < total; p++) from[p] = p;
        for (let i = 0; i < n; i++) {
          const a = axis === 'row' ? index * n + i : i * n + index;
          const j = (i + dir + n) % n;
          const b = axis === 'row' ? index * n + j : j * n + index;
          from[b] = a;
        }
        moves.push({ axis, index, dir, from, code: `${axis === 'row' ? 'r' : 'c'}${index}${dir === 1 ? '+' : '-'}` });
      }
    }
  }
  const apply = (src, m, dst) => { const f = m.from; for (let p = 0; p < total; p++) dst[p] = src[f[p]]; };
  const pack = (g, k, o) => {
    for (let w = 0; w < W; w++) k[o + w] = 0;
    for (let p = 0; p < total; p++) k[o + (p >> 3)] |= g[p] << ((p & 7) * 4);
  };
  const unpack = (k, o, g) => { for (let p = 0; p < total; p++) g[p] = (k[o + (p >> 3)] >>> ((p & 7) * 4)) & 15; };

  // ---------- 1) 목표 배치 모두 찾기 ----------
  const counts = new Array(codeIdx.size).fill(0);
  typeOf.forEach((ty, i) => { if (i !== sp) counts[ty]++; });
  const N = 1, E = 2, S = 4, Wd = 8;
  const goals = [];
  const g = new Uint8Array(total);
  const fits = (p, ty) => {
    const m = portsOfType[ty];
    const r = Math.floor(p / n); const c = p % n;
    if (r === 0 ? (m & N) : (!!(m & N) !== !!(portsOfType[g[p - n]] & S))) return false;
    if (c === 0 ? (m & Wd) : (!!(m & Wd) !== !!(portsOfType[g[p - 1]] & E))) return false;
    if (r === n - 1 && (m & S)) return false;
    if (c === n - 1 && (m & E)) return false;
    return true;
  };
  const connectedAll = () => {
    const seen = new Uint8Array(total); const st = [sp]; seen[sp] = 1; let cnt = 1;
    while (st.length) {
      const p = st.pop(); const m = portsOfType[g[p]]; const r = Math.floor(p / n); const c = p % n;
      const nb = [[N, r - 1, c], [E, r, c + 1], [S, r + 1, c], [Wd, r, c - 1]];
      for (const [d, rr, cc] of nb) {
        if (!(m & d) || rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        const q = rr * n + cc; if (!seen[q]) { seen[q] = 1; cnt++; st.push(q); }
      }
    }
    return cnt === total;
  };
  (function place(p) {
    if (goals.length > 200000) throw new Error('목표 배치가 너무 많음');
    if (p === total) { if (connectedAll()) goals.push(Uint8Array.from(g)); return; }
    if (p === sp) { g[p] = srcType; if (fits(p, srcType)) place(p + 1); return; }
    for (let ty = 0; ty < counts.length; ty++) {
      if (!counts[ty] || ty === srcType && counts[ty] === 0) continue;
      g[p] = ty;
      if (!fits(p, ty)) continue;
      counts[ty]--; place(p + 1); counts[ty]++;
    }
  })(0);

  // 시작 배치
  const start = Uint8Array.from(typeOf);

  // ---------- 2) 목표에서 거꾸로 b수까지 ----------
  const table = makeTable(slotsLog2, W);
  let layer = new Uint32Array(goals.length * W);
  let layerLen = 0;
  for (const goal of goals) { pack(goal, layer, layerLen * W); if (table.add(layer, layerLen * W, 0)) layerLen++; }
  const layerSizes = [layerLen];
  const tmpA = new Uint8Array(total); const tmpB = new Uint8Array(total); const key = new Uint32Array(W);
  // 목표 배치 수에 따라 거꾸로 펼칠 깊이를 정한다: 다음 층이 예산(budget)을 넘을 것 같으면 멈춘다
  let reached = 0;
  for (let d = 1; d <= backDepth; d++) {
    if (table.size + layerLen * GROW > budget) break;
    reached = d;
    let next = new Uint32Array(Math.max(1024, layerLen * 8) * W);
    let nextLen = 0;
    for (let i = 0; i < layerLen; i++) {
      unpack(layer, i * W, tmpA);
      for (const m of moves) {
        apply(tmpA, m, tmpB);
        pack(tmpB, key, 0);
        if (!table.add(key, 0, d)) continue;
        if ((nextLen + 1) * W > next.length) { const bigger = new Uint32Array(next.length * 2); bigger.set(next); next = bigger; }
        next.set(key, nextLen * W); nextLen++;
      }
    }
    layer = next; layerLen = nextLen; layerSizes.push(nextLen);
  }

  // ---------- 3) 시작에서 앞으로 a수까지 깊이 우선 ----------
  backDepth = reached;
  const fwd = Math.max(0, known - 1 - backDepth);
  let best = known; // 이보다 짧은 해답을 찾는다
  let bestPath = null;
  const stack = Array.from({ length: fwd + 1 }, () => new Uint8Array(total));
  const path = [];
  stack[0].set(start);
  const half = Math.floor(n / 2);
  let nodes = 0;
  const visit = (depth, prev, run) => {
    nodes++;
    pack(stack[depth], key, 0);
    const d = table.get(key, 0);
    if (d >= 0 && depth + d < best) { best = depth + d; bestPath = { fwd: path.slice(), state: Uint8Array.from(stack[depth]), d }; }
    if (depth >= fwd || depth + 1 >= best) return;
    for (let mi = 0; mi < moves.length; mi++) {
      const m = moves[mi];
      let nrun = 1;
      if (prev) {
        if (m.axis === prev.axis) {
          if (m.index < prev.index) continue; // 같은 축은 줄 번호 순서로만
          if (m.index === prev.index) {
            if (m.dir !== prev.dir) continue; // 바로 되돌리기
            nrun = run + 1;
            // 같은 줄을 같은 방향으로 반 바퀴 넘게 밀면 반대로 미는 쪽이 짧다. 짝수 판의 딱 반 바퀴는 + 쪽만 쓴다.
            if (nrun > half || (n % 2 === 0 && nrun === half && m.dir === -1)) continue;
          }
        }
      }
      apply(stack[depth], m, stack[depth + 1]);
      path.push(m.code);
      visit(depth + 1, m, nrun);
      path.pop();
    }
  };
  visit(0, null, 0);

  // 더 짧은 해답을 찾았으면 표를 따라 목표까지 이어 붙인다
  let moveCodes = sols[stage.id].basic.moves;
  if (bestPath) {
    const tail = [];
    const cur = Uint8Array.from(bestPath.state);
    let d = bestPath.d;
    while (d > 0) {
      let stepped = false;
      for (const m of moves) {
        apply(cur, m, tmpB); pack(tmpB, key, 0);
        if (table.get(key, 0) === d - 1) { cur.set(tmpB); tail.push(m.code); d--; stepped = true; break; }
      }
      if (!stepped) throw new Error('표를 따라 내려가지 못함');
    }
    moveCodes = [...bestPath.fwd, ...tail];
  }
  // 실제 규칙으로 다시 확인
  const rep = replay(stage, moveCodes, moveFromCode);
  const ok = rep.ok && evaluateResult(stage, evaluateConnections(stage, rep.cells), moveCodes.length).requiredDone;
  if (!ok || moveCodes.length !== best) throw new Error(`해답 확인 실패 (${moveCodes.length} / ${best})`);
  return { id: stage.id, known, shortest: best, proven: true, moves: moveCodes, back: backDepth, fwd, goals: goals.length, layers: layerSizes, table: table.size, nodes, seconds: Math.round((Date.now() - t0) / 1000) };
}

for (const id of ids) {
  const file = resolve(OUT, `${id}.json`);
  if (!FORCE && existsSync(file)) { console.log(`${id}: 이미 있음`); continue; }
  const stage = allStages.find((s) => s.id === id);
  const known = sols[id].basic.length + Number(argOf('--extra', 0)); // --extra: 검사용(알던 길이를 일부러 늘려 더 짧은 해답을 찾게 한다)
  const back = Number(argOf('--back', known - 1));
  const budget = Number(argOf('--budget', 6e7));
  const slots = Number(argOf('--slots', stage.size >= 5 ? 27 : 24));
  try {
    const r = proveStage(stage, known, back, slots, budget);
    writeFileSync(file, JSON.stringify(r, null, 1));
    console.log(`${id}: 최단 ${r.shortest}번 증명 (알던 길이 ${known}, 목표 배치 ${r.goals}, 거꾸로 ${r.back}수 표 ${r.table}, 앞 ${r.fwd}수 ${r.nodes}개, ${r.seconds}초)`);
  } catch (e) {
    console.log(`${id}: 실패 — ${e.message}`);
  }
}
