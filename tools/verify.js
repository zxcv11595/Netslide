// 출시 판 검증 도구 (개발용).
//   node tools/verify.js          데이터 점검 + 보관한 해답을 공통 규칙으로 재생
//   node tools/verify.js --deep   추가로 모든 판의 최단 수를 BFS로 다시 증명(몇 분 걸림)
// 문제가 하나라도 있으면 종료 코드 1.
import { readFileSync } from 'node:fs';
import {
  validateStage, initialCells, evaluateConnections, evaluateResult, moveFromCode,
} from '../src/core/rules.js';
import { replay, solve } from '../src/core/solver.js';
import { parseContent } from '../src/data/parse.js';

const DEEP = process.argv.includes('--deep');
const raw = JSON.parse(readFileSync(new URL('../src/data/stages.json', import.meta.url), 'utf8'));
const sols = JSON.parse(readFileSync(new URL('../tools/out/solutions.json', import.meta.url), 'utf8'));
const content = parseContent(raw);
const MAX_STATES = { 3: 200000, 4: 1500000, 5: 2500000 };

const problems = [];
let checked = 0;
if (sols.contentVersion !== raw.contentVersion) problems.push('해답 자료와 판 데이터의 콘텐츠 버전이 다름');

for (const stage of content.byId.values()) {
  const fail = (msg) => problems.push(`${stage.id}: ${msg}`);
  checked++;
  for (const e of validateStage(stage)) fail(e);
  const sol = sols.solutions[stage.id];
  if (!sol) { fail('해답 자료 없음'); continue; }
  const hasBonus = stage.tiles.some((t) => t.kind === 'goal' && t.bonus);

  if (evaluateResult(stage, evaluateConnections(stage, initialCells(stage)), 0).canComplete) fail('시작 배치가 이미 완료 상태');

  const basic = replay(stage, sol.basic.moves, moveFromCode);
  if (!basic.ok) fail(`기본 해답 재생 실패(${basic.at})`);
  else if (!evaluateResult(stage, evaluateConnections(stage, basic.cells), sol.basic.length).canComplete) fail('기본 해답으로 필수가 이어지지 않음');

  const full = replay(stage, sol.full.moves, moveFromCode);
  if (!full.ok) fail(`보너스 포함 해답 재생 실패(${full.at})`);
  else {
    const res = evaluateResult(stage, evaluateConnections(stage, full.cells), sol.full.length);
    if (!res.requiredDone || (hasBonus && !res.bonusDone)) fail('보너스 포함 해답으로 목표가 모두 이어지지 않음');
    if (!stage.tutorial && res.stars !== 3) fail(`3별 기준(${stage.star3}수)을 해답(${sol.full.length}수)으로 달성할 수 없음`);
  }

  if (DEEP) {
    const again = solve(stage, { maxStates: MAX_STATES[stage.size] });
    if (!again.basic || again.basic.length !== sol.basic.length) fail(`기본 최단 수 불일치: 기록 ${sol.basic.length}, 재탐색 ${again.basic?.length ?? '미발견'}`);
    if (!again.full || again.full.length !== sol.full.length) fail(`보너스 포함 최단 수 불일치: 기록 ${sol.full.length}, 재탐색 ${again.full?.length ?? '미발견'}`);
    process.stdout.write(`  ${stage.id} 재탐색 ${again.states}개 상태\n`);
  }
}

if (problems.length) {
  console.error(`검증 실패 ${problems.length}건 (판 ${checked}개):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`검증 통과: 판 ${checked}개${DEEP ? ' (최단 수 재증명 포함)' : ''}`);
