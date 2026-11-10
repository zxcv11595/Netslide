// 판 상태 공간의 풀이 탐색(BFS). 개발용 생성·검증 도구에서만 쓰며 런타임에서는 호출하지 않는다.
// 현재 배치의 연결 판정(rules.evaluateConnections의 BFS)과는 별개의 탐색이다.
import {
  evaluateConnections, evaluateResult, initialCells, legalMoves, shiftBoard, tileCode, moveToCode,
} from './rules.js';

// 같은 종류의 타일은 구분하지 않는 배치 서명
export function makeSigner(stage) {
  const codes = new Map();
  const sig = stage.tiles.map((t) => {
    const code = tileCode(t);
    if (!codes.has(code)) codes.set(code, String.fromCharCode(48 + codes.size));
    return codes.get(code);
  });
  return (cells) => {
    let s = '';
    for (let i = 0; i < cells.length; i++) s += sig[cells[i]];
    return s;
  };
}

// 반환:
//   basic / full : { length, moves: ["r0+", ...] } 또는 null(제한 안에서 찾지 못함)
//   basicProven / fullProven : 해당 길이가 최단임이 증명되었는가
//     (BFS가 그 깊이 이전 단계를 모두 펼쳤을 때만 true)
//   states : 방문한 서로 다른 배치 수
//   limitHit : 상태 수 제한으로 중단되었는가. true여도 "해답 없음"이 아니라 "미해결/미증명"이다.
//   exhausted : 도달 가능한 모든 배치를 다 본 경우 true (이때 null은 실제로 해답 없음)
export function solve(stage, { maxStates = 500000, maxDepth = 40 } = {}) {
  const moves = legalMoves(stage);
  const sign = makeSigner(stage);
  const start = initialCells(stage);
  const index = new Map();
  const parentIdx = [];
  const moveIdx = [];
  const hasBonus = stage.tiles.some((t) => t.kind === 'goal' && t.bonus);

  let basicAt = -1;
  let fullAt = -1;
  const check = (cells, idx) => {
    const res = evaluateResult(stage, evaluateConnections(stage, cells), 0);
    if (res.requiredDone && basicAt < 0) basicAt = idx;
    if (res.requiredDone && (!hasBonus || res.bonusDone) && fullAt < 0) fullAt = idx;
  };

  index.set(sign(start), 0);
  parentIdx.push(-1);
  moveIdx.push(-1);
  check(start, 0);

  let frontier = [{ cells: start, idx: 0, last: -1 }];
  let depth = 0;
  let limitHit = false;
  let exhausted = false;

  search: while (fullAt < 0 || basicAt < 0) {
    if (frontier.length === 0) { exhausted = true; break; }
    if (depth >= maxDepth) { limitHit = true; break; }
    const next = [];
    for (const node of frontier) {
      if (fullAt >= 0 && basicAt >= 0) break search;
      for (let m = 0; m < moves.length; m++) {
        if (node.last >= 0 && (m ^ 1) === node.last) continue; // 직전 이동의 역이동은 건너뜀
        const cells = shiftBoard(stage, node.cells, moves[m]).cells;
        const key = sign(cells);
        if (index.has(key)) continue;
        const idx = parentIdx.length;
        index.set(key, idx);
        parentIdx.push(node.idx);
        moveIdx.push(m);
        check(cells, idx);
        next.push({ cells, idx, last: m });
      }
      if (index.size >= maxStates) { limitHit = true; break; }
    }
    if (limitHit) break;
    frontier = next;
    depth++;
  }

  const pathOf = (idx) => {
    if (idx < 0) return null;
    const out = [];
    for (let i = idx; parentIdx[i] !== -1; i = parentIdx[i]) out.push(moveToCode(moves[moveIdx[i]]));
    out.reverse();
    return { length: out.length, moves: out };
  };

  // 한 깊이를 펼치는 도중 제한에 걸리면 그 깊이에서 처음 찾은 해답은 같은 깊이의 첫 발견이므로
  // 길이는 여전히 최단이다(이전 깊이는 모두 펼쳤다). 제한 뒤에는 더 찾지 않는다.
  return {
    basic: pathOf(basicAt),
    full: pathOf(fullAt),
    basicProven: basicAt >= 0,
    fullProven: fullAt >= 0,
    states: index.size,
    // 이 깊이까지의 모든 배치를 확인했다. 해답을 못 찾았다면 최단 수는 checkedDepth보다 크다.
    checkedDepth: depth,
    limitHit,
    exhausted,
  };
}

// 이동 표기 배열을 공통 규칙으로 재생
export function replay(stage, moveCodes, parse) {
  let cells = initialCells(stage);
  for (const code of moveCodes) {
    const res = shiftBoard(stage, cells, parse(code));
    if (!res.ok) return { ok: false, reason: res.reason, at: code };
    cells = res.cells;
  }
  return { ok: true, cells };
}

// 어느 배치에서든 "풀리는 길 하나"를 빨리 찾는 탐색(가중 A*). 힌트용이다.
// 최단을 보장하지 않는 대신, 아직 길이 닿지 않은 칸 수를 기준으로 좋아 보이는 배치부터 펼쳐서
// BFS로는 닿지 못하는 깊은 배치에서도 해답을 찾는다.
// 반환: { moves: ["r0+", ...] } 또는 null(제한 안에서 못 찾음)
// target: 풀린 배치를 알고 있으면(타일 종류 배열) 그 배치와 다른 칸 수를 기준으로 삼는다. 훨씬 잘 찾는다.
export function findPath(stage, { maxStates = 60000, weight = 3, target = null } = {}) {
  const moves = legalMoves(stage);
  const sign = makeSigner(stage);
  const total = stage.size * stage.size;
  const kinds = stage.tiles.map(tileCode);
  const score = (cells) => {
    const conn = evaluateConnections(stage, cells);
    if (evaluateResult(stage, conn, 0).requiredDone) return 0;
    if (target) {
      let off = 0;
      for (let i = 0; i < total; i++) if (kinds[cells[i]] !== target[i]) off++;
      return Math.max(1, off);
    }
    let reached = 0;
    for (let i = 0; i < total; i++) reached += conn.reached[i];
    return Math.max(1, total - reached);
  };
  const start = initialCells(stage);
  const h0 = score(start);
  if (h0 === 0) return { moves: [] };
  const seen = new Map([[sign(start), 0]]);
  const nodes = [{ cells: start, parent: -1, move: -1, g: 0 }];
  const buckets = [];
  const push = (f, idx) => { (buckets[f] || (buckets[f] = [])).push(idx); };
  push(weight * h0, 0);
  let low = weight * h0;
  while (seen.size < maxStates) {
    while (low < buckets.length && !(buckets[low] && buckets[low].length)) low++;
    if (low >= buckets.length) return null;
    const idx = buckets[low].pop();
    const node = nodes[idx];
    for (let m = 0; m < moves.length; m++) {
      if (node.move >= 0 && (m ^ 1) === node.move) continue;
      const cells = shiftBoard(stage, node.cells, moves[m]).cells;
      const key = sign(cells);
      const g = node.g + 1;
      if (seen.has(key) && seen.get(key) <= g) continue;
      seen.set(key, g);
      const h = score(cells);
      const at = nodes.length;
      nodes.push({ cells, parent: idx, move: m, g });
      if (h === 0) {
        const out = [];
        for (let i = at; nodes[i].parent !== -1; i = nodes[i].parent) out.push(moveToCode(moves[nodes[i].move]));
        return { moves: out.reverse() };
      }
      const f = g + weight * h;
      push(f, at);
      if (f < low) low = f;
    }
  }
  return null;
}
