// 힌트: 지금 배치에서 다음에 밀 줄 하나를 알려 준다.
// 1) 지금 배치에서 제한된 범위로 최단 풀이를 찾아 첫 수를 알려 준다(작은 탐색이라 즉시 끝난다).
// 2) 범위를 넘으면, 지금까지의 이동이 보관된 해답의 앞부분과 같을 때 해답의 다음 수를 알려 준다.
// 3) 그것도 아니면 되돌리기를 권한다(해답 경로로 돌아가면 2번이 다시 동작한다).
import { moveFromCode } from '../core/rules.js';
import { solve } from '../core/solver.js';

// 반환: { type: 'move', move } | { type: 'undo' } | { type: 'none' }
export function nextHint(stage, cells, historyCodes, solutionCodes = null, { maxStates = 40000 } = {}) {
  // 지금 배치를 시작 배치로 하는 임시 판
  const here = { ...stage, tiles: cells.map((id) => stage.tiles[id]) };
  const found = solve(here, { maxStates });
  if (found.basic) {
    if (found.basic.length === 0) return { type: 'none' };
    return { type: 'move', move: moveFromCode(found.basic.moves[0]) };
  }
  if (Array.isArray(solutionCodes) && historyCodes.length < solutionCodes.length
    && historyCodes.every((c, i) => c === solutionCodes[i])) {
    return { type: 'move', move: moveFromCode(solutionCodes[historyCodes.length]) };
  }
  return historyCodes.length > 0 ? { type: 'undo' } : { type: 'none' };
}
