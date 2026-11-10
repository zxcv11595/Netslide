// 힌트: 플레이어의 "지금 배치"에서 다음에 밀 줄 하나를 알려 준다. 정답 전체를 보여 주지 않는다.
//
// 순서
// 1) 지금 배치에서 최단 풀이를 직접 찾는다(BFS). 풀이까지 몇 수 안 남았으면 여기서 끝난다.
// 2) 지금까지의 이동이 보관된 해답의 앞부분과 같으면 해답의 다음 수를 알려 준다.
// 3) 지금 배치에서 "풀리는 길 하나"를 찾는다(가중 A*). 최단은 아닐 수 있다.
// 4) 그래도 못 찾으면 되돌리기를 권한다. 되돌리다 보면 1~3이 다시 통한다.
//    (많이 흐트러진 5×5는 실시간으로 풀 수 없는 경우가 있어서 이 단계가 필요하다)
import { moveFromCode, shiftBoard, initialCells, tileCode } from '../core/rules.js';
import { solve, findPath } from '../core/solver.js';

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
  let target = null;
  if (hasSolution) {
    let solved = initialCells(stage);
    for (const code of solutionCodes) {
      const res = shiftBoard(stage, solved, moveFromCode(code));
      if (!res.ok) { solved = null; break; }
      solved = res.cells;
    }
    if (solved) target = solved.map((id) => tileCode(stage.tiles[id]));
  }
  const path = findPath(here, { maxStates, weight: 3, target });
  if (path && path.moves.length > 0) return { type: 'move', move: moveFromCode(path.moves[0]) };
  return historyCodes.length > 0 ? { type: 'undo' } : { type: 'none' };
}
