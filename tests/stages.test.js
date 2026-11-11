// 모든 출시 판: 데이터 점검, 해답 재생, 별 목표 달성 가능성
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateStage, initialCells, evaluateConnections, evaluateResult, moveFromCode,
} from '../src/core/rules.js';
import { replay, solve } from '../src/core/solver.js';
import { parseContent } from '../src/data/parse.js';

const raw = JSON.parse(readFileSync(new URL('../src/data/stages.json', import.meta.url), 'utf8'));
const sols = JSON.parse(readFileSync(new URL('../tools/out/solutions.json', import.meta.url), 'utf8'));
const content = parseContent(raw);
const all = [...content.byId.values()];

test('판 구성: 입문 2~3판, 난이도별 판 존재, ID 중복 없음', () => {
  assert.ok(content.groups.tutorial.length >= 2 && content.groups.tutorial.length <= 3);
  for (const g of ['beginner', 'intermediate', 'advanced']) assert.ok(content.groups[g].length >= 5, g);
  assert.ok(content.daily.length >= 7);
  assert.equal(new Set([...raw.stages, ...raw.daily].map((s) => s.id)).size, raw.stages.length + raw.daily.length);
  for (const g of Object.keys(content.groups)) {
    assert.deepEqual(content.groups[g].map((s) => s.order), content.groups[g].map((_, i) => i + 1), `${g} 표시 순서`);
  }
  assert.equal(sols.contentVersion, raw.contentVersion);
});

test('게임용 판 데이터에는 해답이 들어 있지 않다', () => {
  for (const s of [...raw.stages, ...raw.daily]) {
    assert.deepEqual(Object.keys(s).filter((k) => !['id', 'group', 'order', 'size', 'tiles', 'shortest', 'star2', 'star3'].includes(k)), []);
  }
});

for (const stage of all) {
  test(`${stage.id}: 점검·해답 재생·별 목표`, () => {
    assert.deepEqual(validateStage(stage), []);
    const sol = sols.solutions[stage.id];
    assert.ok(sol, '해답 자료 없음');
    const hasBonus = stage.tiles.some((t) => t.kind === 'goal' && t.bonus);

    // 시작 배치는 아직 완료 상태가 아니다
    const start = evaluateResult(stage, evaluateConnections(stage, initialCells(stage)), 0);
    assert.equal(start.canComplete, false);

    // 기본 해답: 공통 규칙으로 재생하면 필수가 모두 이어진다
    const basic = replay(stage, sol.basic.moves, moveFromCode);
    assert.ok(basic.ok);
    const basicRes = evaluateResult(stage, evaluateConnections(stage, basic.cells), sol.basic.moves.length);
    assert.equal(basicRes.canComplete, true);
    assert.equal(sol.basic.moves.length, sol.basic.length);

    // 보너스 포함 해답: 필수 + 모든 보너스가 동시에 이어지고 3별을 실제로 받을 수 있다
    const full = replay(stage, sol.full.moves, moveFromCode);
    assert.ok(full.ok);
    const fullRes = evaluateResult(stage, evaluateConnections(stage, full.cells), sol.full.moves.length);
    assert.equal(fullRes.requiredDone, true);
    if (hasBonus) assert.equal(fullRes.bonusDone, true);
    {
      assert.equal(fullRes.stars, 3, '3별 기준이 달성 가능해야 한다');
      assert.ok(sol.full.length <= stage.star3);
      if (!hasBonus) assert.ok(stage.star2 > stage.star3);
    }
    assert.ok(sol.basic.length <= sol.full.length);
  });
}

test('3×3과 입문 판은 최단 수를 다시 탐색해도 기록과 같다', () => {
  for (const stage of all.filter((s) => s.size === 3)) {
    const again = solve(stage, { maxStates: 200000 });
    assert.equal(again.basic.length, sols.solutions[stage.id].basic.length, stage.id);
    assert.equal(again.full.length, sols.solutions[stage.id].full.length, stage.id);
  }
});
