// tools/prove.js 의 증명 결과(tools/out/proofs/*.json)를 판 자료에 반영한다 (2026-11-12)
//   - 해답 자료(tools/out/solutions.json): 최단 해답·증명 표시
//   - 힌트 자료(src/data/hints.json): 보관 해답
//   - 판 자료(src/data/stages.json): 최단 경로가 더 짧아졌으면 shortest와 별 기준
//   - 보고서(docs/STAGE_REPORT.md): 그 판의 최단 수·증명 칸
// 쓰기: node tools/apply-proofs.js [--dry]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { star3For, star2For } from '../src/core/stars.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const P = (f) => resolve(ROOT, f);
const read = (f) => readFileSync(P(f), 'utf8');
const stagesText = read('src/data/stages.json');
const solsText = read('tools/out/solutions.json');
const hintsText = read('src/data/hints.json');
const stages = JSON.parse(stagesText);
const sols = JSON.parse(solsText);
const hints = JSON.parse(hintsText);
// 원래 파일 모양(들여쓰기) 그대로 다시 쓴다
const fmt = (obj, text) => {
  for (const ind of [2, 1, 0]) {
    if (JSON.stringify(JSON.parse(text), null, ind || undefined) + (text.endsWith('\n') ? '\n' : '') === text) return JSON.stringify(obj, null, ind || undefined) + (text.endsWith('\n') ? '\n' : '');
  }
  throw new Error('파일 모양을 알 수 없음');
};

let report = read('docs/STAGE_REPORT.md');
const changed = [];
let applied = 0;
for (const f of readdirSync(P('tools/out/proofs')).filter((x) => x.endsWith('.json'))) {
  const r = JSON.parse(readFileSync(P(`tools/out/proofs/${f}`), 'utf8'));
  const sol = sols.solutions[r.id];
  if (!sol) continue;
  const st = [...stages.stages, ...stages.daily].find((s) => s.id === r.id);
  sol.basic = { length: r.shortest, moves: r.moves };
  sol.full = sol.basic;
  sol.basicProven = true; sol.fullProven = true; sol.lowerBound = r.shortest; sol.limitHit = false;
  hints.hints[r.id] = r.moves;
  if (st.shortest !== r.shortest) {
    changed.push(`${r.id}: ${st.shortest} → ${r.shortest}`);
    st.shortest = r.shortest; st.star3 = star3For(r.shortest); st.star2 = star2For(r.shortest);
  }
  // 보고서 줄: | ID | 난이도 | 순서 | 크기 | 도토리 | 빈 블록 | 가짜 길 | 최단 수 | 증명 | 3별 | 2별 | 탐색 상태 수 |
  report = report.replace(new RegExp(`^\\| ${r.id} \\|.*$`, 'm'), (line) => {
    const c = line.split('|');
    c[8] = ` ${r.shortest} `; c[9] = ' 예 '; c[10] = ` ${st.star3} `; c[11] = ` ${st.star2} `;
    return c.join('|');
  });
  applied++;
}
const left = Object.entries(sols.solutions).filter(([, v]) => !v.basicProven).map(([k]) => k);
console.log(`반영 ${applied}판, 최단이 바뀐 판 ${changed.length}개${changed.length ? `: ${changed.join(', ')}` : ''}`);
console.log(`아직 미증명: ${left.length ? left.join(' ') : '없음'}`);
if (!DRY) {
  writeFileSync(P('src/data/stages.json'), fmt(stages, stagesText));
  writeFileSync(P('tools/out/solutions.json'), fmt(sols, solsText));
  writeFileSync(P('src/data/hints.json'), fmt(hints, hintsText));
  report = report.replace(/^- 미증명 판은.*$/m, (l) => (left.length ? l : '- 모든 판의 최단 수가 증명됐다(2026-11-12, `tools/prove.js`: 목표 배치에서 거꾸로 펼친 표와 시작 배치에서 앞으로 훑은 길이 만나는 가장 짧은 길이).'));
  writeFileSync(P('docs/STAGE_REPORT.md'), report);
}
