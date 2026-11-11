import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseContent } from '../src/data/parse.js';
import { createSession } from '../src/game/session.js';
import { moveFromCode } from '../src/core/rules.js';
import { starsAt, starGauge } from '../src/core/stars.js';
import { createStore } from '../src/storage/storage.js';
import { migrateTutorialStars, confirmCompletion } from '../src/game/progress.js';
const content = parseContent(JSON.parse(readFileSync('src/data/stages.json', 'utf8')));
const solutions = JSON.parse(readFileSync('tools/out/solutions.json', 'utf8')).solutions;
test('모든 판의 별/감소 게이지 경계와 0 이후 별 1개', () => {
  for (const s of content.byId.values()) {
    assert.deepEqual([0,s.star3,s.star3+1,s.star2,s.star2+1].map(n=>starsAt(s,n)),[3,3,2,2,1]);
    assert.equal(starGauge(s,0),1);
    assert.equal(starGauge(s,s.star2+1),0);
    assert.equal(starGauge(s,999),0);
    assert.ok(starGauge(s,1)<1);
  }
});
test('입문 1~3별 실제 풀이, 저장 왕복, 되돌리기와 재시작', () => {
  const map=new Map(); const backend={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  for (const s of content.groups.tutorial) for (const loops of [0,1,3]) {
    const session=createSession(s), solution=solutions[s.id].basic.moves;
    const move=moveFromCode(solution[0]);
    // 한 줄을 판 크기만큼 밀면 같은 배치로 돌아온다: 불필요한 이동 후 실제 해답을 푼다.
    for(let i=0;i<loops*s.size;i++)session.move(move);
    for(const code of solution)session.move(moveFromCode(code));
    assert.equal(session.result.canComplete,true);
    const expected=starsAt(s,session.moves);
    assert.equal(session.result.stars,expected);
    const key=s.id+loops,store=createStore({key,backend});
    confirmCompletion(store,content,s,session.result,session.moves);
    assert.equal(createStore({key,backend}).content(content.version).records[s.id].stars,expected);
    session.undo(); assert.equal(session.moves,loops*s.size+solution.length-1);
    session.restart(); assert.equal(starGauge(s,session.moves),1);
  }
});
test('입문 구기록은 최소 이동으로 복원하고 이력이 없는 기록과 힌트는 보존', () => {
  const store=createStore({backend:null});const c=store.content(content.version);
  c.records={T1:{done:true,stars:0,best:1},T2:{done:true,stars:0,best:5},T3:{done:true,stars:0,best:null}};
  const hints=store.data.hints;
  assert.equal(migrateTutorialStars(store,content),true);
  assert.deepEqual(['T1','T2','T3'].map(id=>c.records[id].stars),[3,1,0]);
  assert.equal(migrateTutorialStars(store,content),false);
  assert.equal(store.data.hints,hints);
});
