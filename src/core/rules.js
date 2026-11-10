// 순수 규칙 모듈. DOM/렌더러와 무관하며 게임과 Node 도구가 같은 함수를 쓴다.
//
// 용어
// - stage.tiles: 시작 배치 순서의 타일 정의 배열. 타일 ID = 이 배열의 인덱스.
// - cells: 길이 size*size 배열. cells[위치] = 그 칸에 놓인 타일 ID. 시작 배치는 [0,1,2,...].
// - 방향 비트: N=1, E=2, S=4, W=8.

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const DIRS = [N, E, S, W];

const OPP = [];
OPP[N] = S; OPP[E] = W; OPP[S] = N; OPP[W] = E;
const DR = [];
DR[N] = -1; DR[E] = 0; DR[S] = 1; DR[W] = 0;
const DC = [];
DC[N] = 0; DC[E] = 1; DC[S] = 0; DC[W] = -1;

export function opposite(dir) { return OPP[dir]; }
export function dirDelta(dir) { return { dr: DR[dir], dc: DC[dir] }; }

// ---------- 타일 ----------
// 데이터 파일의 짧은 표기: "p5"(수로, 포트 N+S), "s6"(공급원), "g8"(필수 목표, 입구 W),
// "b2"(보너스 목표, 입구 E), "o82"(방향 타일, 입구 W → 출구 E)
export function parseTile(code) {
  const k = code[0];
  if (k === 'p') return { kind: 'pipe', ports: Number(code.slice(1)) };
  if (k === 's') return { kind: 'source', ports: Number(code.slice(1)) };
  if (k === 'g') return { kind: 'goal', ports: Number(code.slice(1)), bonus: false };
  if (k === 'b') return { kind: 'goal', ports: Number(code.slice(1)), bonus: true };
  if (k === 'o') return { kind: 'oneway', in: Number(code[1]), out: Number(code[2]) };
  throw new Error(`알 수 없는 타일 표기: ${code}`);
}

export function tileCode(t) {
  if (t.kind === 'pipe') return `p${t.ports}`;
  if (t.kind === 'source') return `s${t.ports}`;
  if (t.kind === 'goal') return `${t.bonus ? 'b' : 'g'}${t.ports}`;
  if (t.kind === 'oneway') return `o${t.in}${t.out}`;
  throw new Error('알 수 없는 타일');
}

// 화면에 그려지는 열린 변 전체
export function tilePorts(t) {
  return t.kind === 'oneway' ? (t.in | t.out) : t.ports;
}

// side 변으로 흐름이 들어올 수 있는가
function canEnter(t, side) {
  if (t.kind === 'oneway') return t.in === side;
  return (t.ports & side) !== 0;
}

// 들어온 뒤 흐름이 나갈 수 있는 변
function exitMask(t) {
  if (t.kind === 'goal') return 0; // 목표는 끝 타일
  if (t.kind === 'oneway') return t.out;
  return t.ports;
}

const sourceCache = new WeakMap();
export function sourceTileId(stage) {
  let id = sourceCache.get(stage);
  if (id === undefined) {
    id = stage.tiles.findIndex((t) => t.kind === 'source');
    sourceCache.set(stage, id);
  }
  return id;
}

// 공급원 타일은 잠긴 행·열에 있어 움직이지 않으므로 위치 = 타일 ID(시작 위치)
export function sourcePos(stage) { return sourceTileId(stage); }

export function initialCells(stage) {
  return Array.from({ length: stage.size * stage.size }, (_, i) => i);
}

// ---------- 이동 ----------
// move = { axis: 'row' | 'col', index, dir: 1 | -1 }
// dir 1: 행은 오른쪽, 열은 아래쪽으로 한 칸. 끝 타일은 반대편으로 돌아온다.
export function isLineLocked(stage, axis, index) {
  const sp = sourcePos(stage);
  const n = stage.size;
  return axis === 'row' ? Math.floor(sp / n) === index : sp % n === index;
}

export function isValidMove(stage, move) {
  return !!move
    && (move.axis === 'row' || move.axis === 'col')
    && Number.isInteger(move.index) && move.index >= 0 && move.index < stage.size
    && (move.dir === 1 || move.dir === -1);
}

export function shiftBoard(stage, cells, move) {
  if (!isValidMove(stage, move)) return { ok: false, reason: 'invalid' };
  if (isLineLocked(stage, move.axis, move.index)) return { ok: false, reason: 'locked' };
  const n = stage.size;
  const next = cells.slice();
  for (let i = 0; i < n; i++) {
    const from = move.axis === 'row' ? move.index * n + i : i * n + move.index;
    const j = (i + move.dir + n) % n;
    const to = move.axis === 'row' ? move.index * n + j : j * n + move.index;
    next[to] = cells[from];
  }
  return { ok: true, cells: next };
}

export function inverseMove(move) {
  return { axis: move.axis, index: move.index, dir: -move.dir };
}

export function legalMoves(stage) {
  const out = [];
  for (const axis of ['row', 'col']) {
    for (let index = 0; index < stage.size; index++) {
      if (isLineLocked(stage, axis, index)) continue;
      out.push({ axis, index, dir: 1 }, { axis, index, dir: -1 });
    }
  }
  return out;
}

// "r0+" / "c2-" 형태의 저장·기록용 표기
export function moveToCode(m) {
  return `${m.axis === 'row' ? 'r' : 'c'}${m.index}${m.dir === 1 ? '+' : '-'}`;
}

export function moveFromCode(code) {
  if (typeof code !== 'string' || !/^[rc]\d+[+-]$/.test(code)) return null;
  return {
    axis: code[0] === 'r' ? 'row' : 'col',
    index: Number(code.slice(1, -1)),
    dir: code.endsWith('+') ? 1 : -1,
  };
}

// ---------- 연결 ----------
// 공급원에서 BFS. 탐색 상태는 (칸, 들어온 변)이다.
// 반대편 가장자리끼리는 이어지지 않는다(순환은 이동에만 적용).
// 반환:
//   reached[pos]  : 흐름이 닿았는가 (0/1)
//   dist[pos]     : 공급원에서의 칸 수 (닿지 않으면 -1)
//   parent[pos]   : 처음 닿았을 때의 이전 칸 (공급원/미도달은 -1) — 전달 연출의 실제 경로
//   goals         : [{ pos, tileId, bonus, connected }]
export function evaluateConnections(stage, cells) {
  const n = stage.size;
  const total = n * n;
  const tiles = stage.tiles;
  const entered = new Uint8Array(total); // 들어온 변 비트
  const reached = new Uint8Array(total);
  const dist = new Int16Array(total).fill(-1);
  const parent = new Int16Array(total).fill(-1);
  const queue = new Int16Array(total * 4 + 1);
  let head = 0;
  let tail = 0;

  const sp = sourcePos(stage);
  reached[sp] = 1;
  dist[sp] = 0;
  queue[tail++] = sp;

  while (head < tail) {
    const pos = queue[head++];
    const t = tiles[cells[pos]];
    const exits = exitMask(t);
    if (!exits) continue;
    const r = (pos / n) | 0;
    const c = pos % n;
    for (let d = 1; d <= 8; d <<= 1) {
      if (!(exits & d)) continue;
      const nr = r + DR[d];
      const nc = c + DC[d];
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue; // 보드 밖: 순환 연결 없음
      const np = nr * n + nc;
      const side = OPP[d];
      if (entered[np] & side) continue; // 같은 변으로 이미 들어옴 → 순환 경로 종료
      if (!canEnter(tiles[cells[np]], side)) continue;
      entered[np] |= side;
      if (!reached[np]) {
        reached[np] = 1;
        dist[np] = dist[pos] + 1;
        parent[np] = pos;
      }
      queue[tail++] = np;
    }
  }

  const goals = [];
  let requiredTotal = 0;
  let requiredConnected = 0;
  let bonusTotal = 0;
  let bonusConnected = 0;
  for (let pos = 0; pos < total; pos++) {
    const id = cells[pos];
    const t = tiles[id];
    if (t.kind !== 'goal') continue;
    const connected = reached[pos] === 1;
    goals.push({ pos, tileId: id, bonus: t.bonus, connected });
    if (t.bonus) { bonusTotal++; if (connected) bonusConnected++; }
    else { requiredTotal++; if (connected) requiredConnected++; }
  }
  return {
    reached, dist, parent, goals,
    requiredTotal, requiredConnected, bonusTotal, bonusConnected,
  };
}

// 공급원 → pos 까지의 실제 연결 경로(위치 배열). 닿지 않았으면 null.
export function pathTo(conn, pos) {
  if (!conn.reached[pos]) return null;
  const path = [];
  for (let p = pos; p !== -1; p = conn.parent[p]) path.push(p);
  return path.reverse();
}

// ---------- 결과 ----------
// 별 규칙
// - 입문(stage.tutorial): 별 없이 완료만 표시 (stars 0)
// - 보너스 있는 판: 1=필수 / 2=필수+모든 보너스 / 3=2별 조건 + star3 이동 수 이내
// - 보너스 없는 판: 1=필수 / 2=star2 이내 / 3=star3 이내 (star3 < star2)
export function evaluateResult(stage, conn, moves) {
  const requiredDone = conn.requiredTotal > 0 && conn.requiredConnected === conn.requiredTotal;
  const hasBonus = conn.bonusTotal > 0;
  const bonusDone = requiredDone && hasBonus && conn.bonusConnected === conn.bonusTotal;
  let stars = 0;
  if (requiredDone && !stage.tutorial) {
    stars = 1;
    if (hasBonus) {
      if (bonusDone) stars = moves <= stage.star3 ? 3 : 2;
    } else if (moves <= stage.star3) stars = 3;
    else if (moves <= stage.star2) stars = 2;
  }
  return { requiredDone, hasBonus, bonusDone, canComplete: requiredDone, stars };
}

// ---------- 데이터 점검 ----------
export function validateStage(stage) {
  const errors = [];
  const n = stage.size;
  if (![3, 4, 5].includes(n)) errors.push('size는 3, 4, 5만 지원');
  if (!Array.isArray(stage.tiles) || stage.tiles.length !== n * n) {
    errors.push('타일 수가 size*size와 다름');
    return errors;
  }
  const sources = stage.tiles.filter((t) => t.kind === 'source').length;
  if (sources !== 1) errors.push(`공급원은 1개여야 함 (현재 ${sources})`);
  else {
    const sp = sourcePos(stage);
    const r = Math.floor(sp / n);
    const c = sp % n;
    if (n === 4) {
      if (![1, 2].includes(r) || ![1, 2].includes(c)) errors.push('4×4 공급원은 중앙 네 칸 중 하나');
    } else if (r !== (n - 1) / 2 || c !== (n - 1) / 2) errors.push('공급원은 중앙이어야 함');
  }
  let required = 0;
  let bonus = 0;
  for (const t of stage.tiles) {
    if (t.kind === 'goal') {
      if (!DIRS.includes(t.ports)) errors.push('목표는 입구가 정확히 하나여야 함');
      if (t.bonus) bonus++; else required++;
    } else if (t.kind === 'oneway') {
      if (!DIRS.includes(t.in) || !DIRS.includes(t.out) || t.in === t.out) errors.push('방향 타일 입구/출구 오류');
    } else if (t.ports < 0 || t.ports > 15) errors.push('포트 값 오류');
  }
  if (required < 1) errors.push('필수 목표가 최소 1개 필요');
  if (!stage.tutorial) {
    if (!Number.isInteger(stage.star3) || stage.star3 < 1) errors.push('star3 누락');
    if (bonus === 0 && !(Number.isInteger(stage.star2) && stage.star2 > stage.star3)) {
      errors.push('보너스 없는 판은 star2 > star3 이어야 함');
    }
  }
  return errors;
}
