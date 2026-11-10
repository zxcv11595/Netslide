import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shiftBoard, inverseMove, initialCells, legalMoves, isLineLocked, evaluateConnections,
  evaluateResult, sourcePos, moveToCode, moveFromCode, pathTo, validateStage,
} from '../src/core/rules.js';
import { parseStage } from '../src/data/parse.js';
import { createSession } from '../src/game/session.js';

const mk = (tiles, extra = {}) => parseStage({ id: 'X1', group: 'beginner', order: 1, size: tiles.length, tiles, star2: 5, star3: 3, ...extra });
const S4 = mk(['p5 p10 p3 p6', 'p12 s6 p9 p0', 'g1 p7 b8 p11', 'p0 p13 p14 p5']);

test('이동 + 역이동은 원래 배치로 돌아온다', () => {
  for (const m of legalMoves(S4)) {
    const a = shiftBoard(S4, initialCells(S4), m);
    const b = shiftBoard(S4, a.cells, inverseMove(m));
    assert.deepEqual(b.cells, initialCells(S4));
  }
});

test('N칸 줄을 N번 밀면 원래 배치', () => {
  for (const m of legalMoves(S4)) {
    let c = initialCells(S4);
    for (let i = 0; i < S4.size; i++) c = shiftBoard(S4, c, m).cells;
    assert.deepEqual(c, initialCells(S4));
  }
});

test('공급원이 있는 행·열은 잠겨 있고 이동해도 공급원은 제자리', () => {
  const sp = sourcePos(S4);
  assert.equal(sp, 5);
  assert.equal(isLineLocked(S4, 'row', 1), true);
  assert.equal(isLineLocked(S4, 'col', 1), true);
  assert.deepEqual(shiftBoard(S4, initialCells(S4), { axis: 'row', index: 1, dir: 1 }), { ok: false, reason: 'locked' });
  assert.equal(shiftBoard(S4, initialCells(S4), { axis: 'col', index: 1, dir: -1 }).ok, false);
  assert.equal(legalMoves(S4).length, 12);
  let c = initialCells(S4);
  for (const m of legalMoves(S4)) { c = shiftBoard(S4, c, m).cells; assert.equal(c[sp], sp); }
});

test('잘못된 이동은 거부된다', () => {
  for (const m of [null, {}, { axis: 'diag', index: 0, dir: 1 }, { axis: 'row', index: 9, dir: 1 }, { axis: 'row', index: 0, dir: 2 }]) {
    assert.equal(shiftBoard(S4, initialCells(S4), m).reason, 'invalid');
  }
});

test('타일 수와 ID가 보존되고 끝 타일은 반대편으로 돌아온다', () => {
  const r = shiftBoard(S4, initialCells(S4), { axis: 'row', index: 0, dir: 1 });
  assert.deepEqual(r.cells.slice(0, 4), [3, 0, 1, 2]);
  const c = shiftBoard(S4, initialCells(S4), { axis: 'col', index: 3, dir: -1 });
  assert.deepEqual([3, 7, 11, 15].map((p) => c.cells[p]), [7, 11, 15, 3]);
  let cells = initialCells(S4);
  for (let i = 0; i < 40; i++) cells = shiftBoard(S4, cells, legalMoves(S4)[(i * 7) % 12]).cells;
  assert.deepEqual([...cells].sort((a, b) => a - b), initialCells(S4));
});

test('이동은 타일 방향을 바꾸지 않는다(타일 정의 불변)', () => {
  const before = JSON.stringify(S4.tiles);
  let cells = initialCells(S4);
  for (const m of legalMoves(S4)) cells = shiftBoard(S4, cells, m).cells;
  evaluateConnections(S4, cells);
  assert.equal(JSON.stringify(S4.tiles), before);
});

test('이동 표기 왕복', () => {
  for (const m of legalMoves(S4)) assert.deepEqual(moveFromCode(moveToCode(m)), m);
  assert.equal(moveFromCode('x1+'), null);
  assert.equal(moveFromCode(12), null);
});

test('포트가 서로 마주 볼 때만 연결된다', () => {
  const ok = mk(['p0 p0 p0', 'p0 s2 g8', 'p0 p0 p0']);
  assert.equal(evaluateConnections(ok, initialCells(ok)).requiredConnected, 1);
  const wrongSide = mk(['p0 p0 p0', 'p0 s2 g1', 'p0 p0 p0']);
  assert.equal(evaluateConnections(wrongSide, initialCells(wrongSide)).requiredConnected, 0);
  const sourceClosed = mk(['p0 p0 p0', 'p0 s1 g8', 'p0 p0 p0']);
  assert.equal(evaluateConnections(sourceClosed, initialCells(sourceClosed)).requiredConnected, 0);
});

test('보드 반대편 가장자리끼리는 이어지지 않는다', () => {
  const st = mk(['p0 p0 p0', 'g8 s2 p10', 'p0 p0 p0']);
  const conn = evaluateConnections(st, initialCells(st));
  assert.equal(conn.reached[5], 1);
  assert.equal(conn.requiredConnected, 0);
});

test('방향 타일은 지정 입구 → 출구로만 흐른다', () => {
  const fwd = mk(['p0 p0 p0', 'p0 s4 g4', 'p0 p3 o81']);
  assert.equal(evaluateConnections(fwd, initialCells(fwd)).requiredConnected, 1);
  const rev = mk(['p0 p0 p0', 'p0 s4 g4', 'p0 p3 o18']);
  const conn = evaluateConnections(rev, initialCells(rev));
  assert.equal(conn.reached[8], 0, '출구 쪽으로는 들어갈 수 없다');
  assert.equal(conn.requiredConnected, 0);
  // 출구가 가리키는 쪽 이웃만 받는다
  const side = mk(['p0 p0 p0', 'p0 s2 o84', 'p0 g2 g1']);
  const c2 = evaluateConnections(side, initialCells(side));
  assert.equal(c2.reached[8], 1);
  assert.equal(c2.reached[7], 0);
});

test('순환 경로에서도 탐색이 끝나고 경로를 돌려준다', () => {
  const loop = mk(['p0 p0 p0 p0', 'p0 s6 p12 p0', 'p0 p3 p9 p0', 'p0 p0 p0 g1'], { star2: 5, star3: 3 });
  const conn = evaluateConnections(loop, initialCells(loop));
  assert.equal([...conn.reached].reduce((a, b) => a + b, 0), 4);
  assert.deepEqual(pathTo(conn, 10).length, 3);
  assert.equal(pathTo(conn, 15), null);
});

test('연결은 매번 현재 배치 전체에서 다시 계산된다(끊기면 미연결)', () => {
  const st = mk(['p0 p0 g8', 'p0 s2 p0', 'p0 p0 p0']);
  const s = createSession(st);
  s.move({ axis: 'col', index: 2, dir: 1 });
  assert.equal(s.result.canComplete, true);
  s.move({ axis: 'col', index: 2, dir: 1 });
  assert.equal(s.result.canComplete, false);
  assert.equal(s.conn.requiredConnected, 0);
});

test('필수와 보너스는 동시에 이어져 있어야 한다', () => {
  const st = mk(['p0 g4 p0', 'b2 s11 g8', 'p0 p0 p0'], { star2: null, star3: 2 });
  const both = evaluateConnections(st, initialCells(st));
  const res = evaluateResult(st, both, 2);
  assert.deepEqual([res.requiredDone, res.bonusDone, res.stars], [true, true, 3]);
  // 보너스만 이어지고 필수가 끊기면 완료 불가
  const cells = shiftBoard(st, initialCells(st), { axis: 'row', index: 0, dir: 1 }).cells;
  const r2 = evaluateResult(st, evaluateConnections(st, cells), 1);
  assert.deepEqual([r2.requiredDone, r2.bonusDone, r2.canComplete, r2.stars], [false, false, false, 0]);
});

test('별 경계: 보너스 없는 판', () => {
  const st = mk(['p0 p0 p0', 'p0 s2 g8', 'p0 p0 p0'], { star2: 5, star3: 3 });
  const conn = evaluateConnections(st, initialCells(st));
  assert.deepEqual([0, 3, 4, 5, 6, 99].map((m) => evaluateResult(st, conn, m).stars), [3, 3, 2, 2, 1, 1]);
});

test('별 경계: 보너스 있는 판', () => {
  const full = mk(['p0 p0 p0', 'b2 s10 g8', 'p0 p0 p0'], { star2: null, star3: 4 });
  const conn = evaluateConnections(full, initialCells(full));
  assert.deepEqual([4, 5].map((m) => evaluateResult(full, conn, m).stars), [3, 2]);
  const basic = mk(['b2 p0 p0', 'p0 s10 g8', 'p0 p0 p0'], { star2: null, star3: 4 });
  const c2 = evaluateConnections(basic, initialCells(basic));
  assert.deepEqual([0, 4, 50].map((m) => evaluateResult(basic, c2, m).stars), [1, 1, 1]);
});

test('입문은 별 없이 완료만', () => {
  const st = parseStage({ id: 'T9', group: 'tutorial', order: 1, size: 3, tiles: ['p0 p0 p0', 'p0 s2 g8', 'p0 p0 p0'] });
  const res = evaluateResult(st, evaluateConnections(st, initialCells(st)), 1);
  assert.deepEqual([res.canComplete, res.stars], [true, 0]);
});

test('데이터 점검이 잘못된 판을 잡아낸다', () => {
  assert.deepEqual(validateStage(S4), []);
  assert.ok(validateStage(mk(['p0 p0 p0', 'p0 p0 g8', 'p0 p0 p0'])).length > 0, '공급원 없음');
  assert.ok(validateStage(mk(['s2 g8 p0', 'p0 p0 p0', 'p0 p0 p0'])).length > 0, '공급원 위치');
  assert.ok(validateStage(mk(['p0 p0 p0', 'p0 s2 g12', 'p0 p0 p0'])).length > 0, '목표 입구 2개');
  assert.ok(validateStage(mk(['p0 p0 p0', 'p0 s2 g8', 'p0 p0 p0'], { star2: 3, star3: 3 })).length > 0, 'star2 > star3');
});

// ---------- 세션 ----------
test('되돌리기는 직전 배치와 이동 수를 함께 복원한다', () => {
  const s = createSession(S4);
  const a = { axis: 'row', index: 0, dir: 1 };
  const b = { axis: 'col', index: 2, dir: -1 };
  s.move(a);
  const afterA = s.cells.slice();
  s.move(b);
  assert.equal(s.moves, 2);
  s.undo();
  assert.equal(s.moves, 1);
  assert.deepEqual(s.cells, afterA);
  s.undo();
  assert.deepEqual(s.cells, initialCells(S4));
  assert.equal(s.undo().ok, false);
  assert.equal(s.moves, 0);
});

test('되돌린 뒤 새 이동은 이전 미래 이력을 버린다', () => {
  const s = createSession(S4);
  s.move({ axis: 'row', index: 0, dir: 1 });
  s.move({ axis: 'row', index: 2, dir: 1 });
  s.move({ axis: 'row', index: 3, dir: 1 });
  s.undo();
  s.undo();
  s.move({ axis: 'col', index: 0, dir: 1 });
  assert.deepEqual(s.historyCodes(), ['r0+', 'c0+']);
});

test('잠긴 줄/무효 입력은 0수', () => {
  const s = createSession(S4);
  assert.equal(s.move({ axis: 'row', index: 1, dir: 1 }).ok, false);
  assert.equal(s.move({ axis: 'row', index: 7, dir: 1 }).ok, false);
  assert.equal(s.moves, 0);
  assert.deepEqual(s.cells, initialCells(S4));
});

test('재시작은 시작 배치와 0수', () => {
  const s = createSession(S4);
  s.move({ axis: 'row', index: 0, dir: 1 });
  s.move({ axis: 'col', index: 3, dir: 1 });
  s.restart();
  assert.equal(s.moves, 0);
  assert.equal(s.canUndo, false);
  assert.deepEqual(s.cells, initialCells(S4));
});

test('저장된 이력에서 복원하고, 잘못된 이력은 처음부터', () => {
  const a = createSession(S4);
  a.move({ axis: 'row', index: 0, dir: 1 });
  a.move({ axis: 'col', index: 2, dir: -1 });
  const b = createSession(S4, a.historyCodes());
  assert.deepEqual(b.cells, a.cells);
  assert.equal(b.moves, 2);
  for (const bad of [['r1+'], ['zz'], ['r0+', 42], ['r9-']]) {
    const c = createSession(S4, bad);
    assert.equal(c.moves, 0);
    assert.deepEqual(c.cells, initialCells(S4));
  }
});
