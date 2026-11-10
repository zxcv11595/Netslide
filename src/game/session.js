// 현재 판의 배치·이력·완료 가능 상태. 규칙은 모두 core/rules.js를 호출한다.
import {
  initialCells, shiftBoard, inverseMove, evaluateConnections, evaluateResult,
  moveToCode, moveFromCode,
} from '../core/rules.js';

// savedHistory: ["r0+", ...] (저장에서 복원할 때). 재생이 실패하면 처음부터 시작한다.
export function createSession(stage, savedHistory = null) {
  let cells = initialCells(stage);
  let history = []; // 적용된 이동(객체) 목록. 이동 수 = history.length
  let conn = null;
  let result = null;

  const refresh = () => {
    conn = evaluateConnections(stage, cells);
    result = evaluateResult(stage, conn, history.length);
  };

  if (Array.isArray(savedHistory)) {
    let c = cells;
    const h = [];
    let ok = true;
    for (const code of savedHistory) {
      const m = moveFromCode(code);
      const res = m ? shiftBoard(stage, c, m) : { ok: false };
      if (!res.ok) { ok = false; break; }
      c = res.cells;
      h.push(m);
    }
    if (ok) { cells = c; history = h; }
  }
  refresh();

  return {
    stage,
    get cells() { return cells; },
    get moves() { return history.length; },
    get conn() { return conn; },
    get result() { return result; },
    get canUndo() { return history.length > 0; },

    // 무효/잠긴 줄 입력은 0수(상태 변화 없음)
    move(m) {
      const res = shiftBoard(stage, cells, m);
      if (!res.ok) return res;
      const prevCells = cells;
      cells = res.cells;
      history.push({ axis: m.axis, index: m.index, dir: m.dir }); // 되돌린 뒤의 새 이동은 이전 미래 이력을 남기지 않는다
      refresh();
      return { ok: true, prevCells, applied: m };
    },

    // 직전 배치와 이동 수를 함께 복원
    undo() {
      if (!history.length) return { ok: false, reason: 'empty' };
      const inv = inverseMove(history[history.length - 1]);
      const res = shiftBoard(stage, cells, inv);
      const prevCells = cells;
      cells = res.cells;
      history.pop();
      refresh();
      return { ok: true, prevCells, applied: inv };
    },

    restart() {
      cells = initialCells(stage);
      history = [];
      refresh();
    },

    historyCodes() { return history.map(moveToCode); },
  };
}
