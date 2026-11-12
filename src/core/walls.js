// 벽 보기 힌트: 정답 배치에서 길이 이어지지 않는 이웃 칸 사이에 벽을 세운다.
// 벽이 없는 곳으로만 길이 지나가므로, 벽을 보면 정답 길의 모양을 알 수 있다(원작 Netslide의 장벽과 같은 단서).
import { N, E, S, W, initialCells, shiftBoard, moveFromCode, tilePorts } from './rules.js';

// solution: 이동 코드 배열(처음 배치에서 정답까지). 반환: [{ r, c, dir }]
//   dir 'v' = (r, c)와 (r, c+1) 사이의 세로 벽, 'h' = (r, c)와 (r+1, c) 사이의 가로 벽
export function solutionWalls(stage, solution) {
  if (!Array.isArray(solution) || stage.wrap) return []; // 끝끼리 이어진 판에는 벽을 세우지 않는다
  let cells = initialCells(stage);
  for (const code of solution) {
    const res = shiftBoard(stage, cells, moveFromCode(code));
    if (!res.ok) return [];
    cells = res.cells;
  }
  const n = stage.size;
  const ports = (pos) => tilePorts(stage.tiles[cells[pos]]);
  const walls = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = r * n + c;
      if (c < n - 1 && !((ports(p) & E) && (ports(p + 1) & W))) walls.push({ r, c, dir: 'v' });
      if (r < n - 1 && !((ports(p) & S) && (ports(p + n) & N))) walls.push({ r, c, dir: 'h' });
    }
  }
  return walls;
}
