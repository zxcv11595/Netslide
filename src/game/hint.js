// 힌트: 플레이어의 "지금 배치"에서 다음에 밀 줄을 알려 준다.
// nextHint는 한 수만(입문 안내용), planHint는 끝까지 가는 길(힌트 버튼용)을 돌려준다.
//
// nextHint의 순서
// 1) 지금 배치에서 최단 풀이를 직접 찾는다(BFS). 풀이까지 몇 수 안 남았으면 여기서 끝난다.
// 2) 지금까지의 이동이 보관된 해답의 앞부분과 같으면 해답의 다음 수를 알려 준다.
// 3) 지금 배치에서 "풀리는 길 하나"를 찾는다(가중 A*). 최단은 아닐 수 있다.
// 4) 그래도 못 찾으면 되돌리기를 권한다. 되돌리다 보면 1~3이 다시 통한다.
import {
  moveFromCode, moveToCode, inverseMove, shiftBoard, initialCells, tileCode,
  legalMoves, evaluateConnections, evaluateResult,
} from '../core/rules.js';
import { solve, findPath, makeSigner } from '../core/solver.js';

// 반환: { type: 'move', move } | { type: 'undo' } | { type: 'none' }
export function nextHint(stage, cells, historyCodes, solutionCodes = null, { maxStates = 40000 } = {}) {
  // 지금 배치를 시작 배치로 하는 임시 판
  const here = { ...stage, tiles: cells.map((id) => stage.tiles[id]) };
  const found = solve(here, { maxStates });
  if (found.basic) {
    if (found.basic.length === 0) return { type: 'none' };
    return { type: 'move', move: moveFromCode(found.basic.moves[0]) };
  }
  const hasSolution = Array.isArray(solutionCodes) && solutionCodes.length > 0;
  if (hasSolution && historyCodes.length < solutionCodes.length
    && historyCodes.every((c, i) => c === solutionCodes[i])) {
    return { type: 'move', move: moveFromCode(solutionCodes[historyCodes.length]) };
  }
  // 풀린 배치(타일 종류 배열)를 알면 그것을 목표로 삼아 더 잘 찾는다
  const solved = hasSolution ? replayCells(stage, solutionCodes) : null;
  const target = solved ? solved.map((id) => tileCode(stage.tiles[id])) : null;
  const path = findPath(here, { maxStates, weight: 3, target });
  if (path && path.moves.length > 0) return { type: 'move', move: moveFromCode(path.moves[0]) };
  return historyCodes.length > 0 ? { type: 'undo' } : { type: 'none' };
}

// 처음 배치에서 이동 표기를 차례로 적용한 배치. 재생이 안 되면 null.
function replayCells(stage, codes) {
  let cells = initialCells(stage);
  for (const code of codes) {
    const res = shiftBoard(stage, cells, moveFromCode(code));
    if (!res.ok) return null;
    cells = res.cells;
  }
  return cells;
}

// ---------- 힌트 버튼용: 양쪽에서 찾기 ----------
// 완성 배치를 이미 알고 있으므로, 완성 쪽에서 거꾸로 몇 수를 미리 펼쳐 표로 만들어 두고
// 지금 배치에서 앞으로 펼치다가 그 표(또는 보관 해답이 지나는 배치)를 만나면 길이 이어진다.
// 한쪽에서만 찾을 때보다 같은 시간에 두 배 가까이 먼 배치까지 닿는다.
const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());
const isDone = (stage, cells) => evaluateResult(stage, evaluateConnections(stage, cells), 0).requiredDone;

// 판 크기별로 거꾸로 펼칠 깊이(표 크기: 3×3 전부, 4×4 약 5만, 5×5 약 3만 배치)
export function backDepthFor(size) { return size <= 3 ? 8 : size === 4 ? 5 : 4; }

// 표: 서명 → 거리 * 64 + (그 배치로 들어온 이동 번호). 완성 배치는 0 * 64 + 63.
// 이동 번호 m의 역이동은 m ^ 1 (legalMoves가 +,- 를 짝으로 내놓는다).
function buildKnown(stage, solutionCodes, depth) {
  const solved = replayCells(stage, solutionCodes);
  if (!solved) return null;
  const moves = legalMoves(stage);
  const sign = makeSigner(stage);
  const table = new Map([[sign(solved), 63]]);
  let frontier = [{ c: solved, last: -1 }];
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next = [];
    for (const node of frontier) {
      for (let m = 0; m < moves.length; m++) {
        if (node.last >= 0 && (m ^ 1) === node.last) continue;
        const c = shiftBoard(stage, node.c, moves[m]).cells;
        const k = sign(c);
        if (table.has(k)) continue;
        table.set(k, d * 64 + m);
        next.push({ c, last: m });
      }
    }
    frontier = next;
  }
  // 보관 해답이 지나는 배치: 서명 → 해답의 몇 번째 수부터 이으면 되는지
  const route = new Map();
  let c = initialCells(stage);
  for (let i = 0; i < solutionCodes.length; i++) {
    const k = sign(c);
    if (!route.has(k)) route.set(k, i);
    c = shiftBoard(stage, c, moveFromCode(solutionCodes[i])).cells;
  }
  return { table, route, total: solutionCodes.length };
}

const knownCache = new Map();
function getKnown(stage, solutionCodes, depth) {
  if (!Array.isArray(solutionCodes) || !solutionCodes.length) return null;
  const key = `${stage.id}|${depth}|${solutionCodes.join(',')}`;
  if (!knownCache.has(key)) {
    if (knownCache.size >= 4) knownCache.clear(); // 판을 옮겨 다녀도 메모리가 쌓이지 않게
    knownCache.set(key, buildKnown(stage, solutionCodes, depth));
  }
  return knownCache.get(key);
}

// 표를 미리 만들어 둔다
export function warmHint(stage, solutionCodes) {
  getKnown(stage, solutionCodes, backDepthFor(stage.size));
}

// 이 배치에서 완성까지 "아는 길"의 길이. 모르면 -1.
function knownLeft(known, key) {
  const t = known.table.get(key);
  const r = known.route.get(key);
  const a = t === undefined ? Infinity : t >> 6;
  const b = r === undefined ? Infinity : known.total - r;
  const best = Math.min(a, b);
  return best === Infinity ? -1 : best;
}

// 아는 배치에서 완성까지의 이동 표기
function knownPath(stage, known, solutionCodes, cells) {
  const moves = legalMoves(stage);
  const sign = makeSigner(stage);
  const key = sign(cells);
  const t = known.table.get(key);
  const r = known.route.get(key);
  if (r !== undefined && (t === undefined || known.total - r < (t >> 6))) return solutionCodes.slice(r);
  const out = [];
  let c = cells;
  for (let v = t; v !== undefined && (v >> 6) > 0; v = known.table.get(sign(c))) {
    const inv = moves[(v & 63) ^ 1];
    out.push(moveToCode(inv));
    c = shiftBoard(stage, c, inv).cells;
  }
  return out;
}

// 지금 배치에서 앞으로 펼친다. 풀린 배치나 아는 배치를 만나면 길이 완성된다.
// 반환: { moves, exact } | null
function searchForward(stage, cells, known, solutionCodes, { maxStates, deadline, maxDepth = 99, checkDone = true }) {
  const moves = legalMoves(stage);
  const sign = makeSigner(stage);
  const startKey = sign(cells);
  const seen = new Set([startKey]);
  const parent = [-1];
  const via = [-1];
  const pathOf = (idx) => {
    const out = [];
    for (let i = idx; parent[i] !== -1; i = parent[i]) out.push(moveToCode(moves[via[i]]));
    return out.reverse();
  };
  let best = null; // { idx, cells, total }
  if (known) {
    const left = knownLeft(known, startKey);
    if (left >= 0) best = { idx: 0, cells, total: left };
  }
  let frontier = [{ cells, idx: 0, last: -1 }];
  let ticks = 0;
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    if (best && depth >= best.total) break; // 더 깊이 가도 짧아질 수 없다
    const next = [];
    let stop = false;
    for (const node of frontier) {
      for (let m = 0; m < moves.length; m++) {
        if (node.last >= 0 && (m ^ 1) === node.last) continue;
        const c = shiftBoard(stage, node.cells, moves[m]).cells;
        const key = sign(c);
        if (seen.has(key)) continue;
        seen.add(key);
        const idx = parent.length;
        parent.push(node.idx);
        via.push(m);
        // 다른 정답이라도 풀리면 된다. 이 깊이 전에는 풀린 배치가 없었으므로 최단이다.
        if (checkDone && isDone(stage, c)) return { moves: pathOf(idx), exact: true };
        if (known) {
          const left = knownLeft(known, key);
          if (left >= 0 && (!best || depth + left < best.total)) best = { idx, cells: c, total: depth + left };
        }
        next.push({ cells: c, idx, last: m });
      }
      if (seen.size >= maxStates) { stop = true; break; }
      if (deadline && (++ticks & 31) === 0 && now() > deadline) { stop = true; break; }
    }
    if (stop) break;
    frontier = next;
  }
  if (!best) return null;
  return { moves: [...pathOf(best.idx), ...knownPath(stage, known, solutionCodes, best.cells)], exact: false };
}

// 지금 배치에서 끝까지 가는 길을 찾는다. 되돌리는 길은 안내하지 않는다.
// 반환
//   { type: 'path', kind: 'near', moves, back: 0, exact } : 찾았다. exact면 최단임이 확인된 길
//   { type: 'far', undo }  : 여기서는 못 찾았다. undo번 되돌리면 찾을 수 있다(차감하지 않고 알려 준다)
//   { type: 'none' }       : 알려 줄 것이 없다(이미 풀렸거나 해답 자료가 없다)
// budgetMs를 주면 그 시간 안에서만 찾는다.
export function planHint(stage, cells, historyCodes, solutionCodes = null, { maxStates = 60000, budgetMs = 0, backDepth = backDepthFor(stage.size) } = {}) {
  const deadline = budgetMs ? now() + budgetMs : 0;
  if (isDone(stage, cells)) return { type: 'none' };
  const known = getKnown(stage, solutionCodes, backDepth);
  if (known) {
    // 보관 해답이 지나는 배치이거나 미리 만든 표 안의 배치면, 길이 이미 확보되어 있으므로 탐색 없이 바로 준다
    const ready = knownPath(stage, known, solutionCodes, cells);
    const key = makeSigner(stage)(cells);
    if (knownLeft(known, key) >= 0 && ready.length > 0) return { type: 'path', kind: 'near', moves: ready, back: 0, exact: false };
  }
  const found = searchForward(stage, cells, known, solutionCodes, { maxStates, deadline });
  if (found && found.moves.length > 0) return { type: 'path', kind: 'near', moves: found.moves, back: 0, exact: found.exact };
  if (!known || !historyCodes.length) return { type: 'none' };

  // 민 기록을 하나씩 거꾸로 짚어 가며, 두 수 안에 아는 배치에 닿는 첫 지점을 찾는다.
  // 맨 처음 배치는 보관 해답의 출발점이므로 반드시 끝난다.
  let c = cells;
  for (let n = 1; n <= historyCodes.length; n++) {
    const res = shiftBoard(stage, c, inverseMove(moveFromCode(historyCodes[historyCodes.length - n])));
    if (!res.ok) break;
    c = res.cells;
    if (searchForward(stage, c, known, solutionCodes, { maxStates: 2000, deadline: 0, maxDepth: 2, checkDone: false })) {
      return { type: 'far', undo: n };
    }
  }
  return { type: 'far', undo: historyCodes.length };
}

// 힌트 하나로 안내할 수: 남은 길의 절반(내림, 최소 minGuide수)
export function guideCount(plan, minGuide = 2) {
  return Math.min(plan.moves.length, Math.max(minGuide, Math.floor(plan.moves.length / 2)));
}
