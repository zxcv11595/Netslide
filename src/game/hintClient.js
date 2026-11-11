// 힌트 길 찾기 요청. 워커를 쓸 수 없으면 같은 스레드에서 짧게만 찾는다.
import { planHint } from './hint.js';

let worker = null;
let seq = 0;
const waiting = new Map();

function dropWorker() {
  try { worker?.terminate(); } catch { /* 무시 */ }
  worker = null;
  const pending = [...waiting.values()];
  waiting.clear();
  for (const done of pending) done(null);
}

function getWorker() {
  if (worker || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./hintWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const done = waiting.get(e.data.id);
      if (done) { waiting.delete(e.data.id); done(e.data.res); }
    };
    worker.onerror = () => dropWorker();
  } catch {
    worker = null;
  }
  return worker;
}

// 판에 들어올 때: 완성 쪽에서 거꾸로 펼친 표를 워커에서 미리 만들어 둔다(첫 힌트가 빨라진다)
export function warmPlan(stage, solution) {
  if (!solution) return;
  try { getWorker()?.postMessage({ warm: true, stage, solution }); } catch { /* 무시 */ }
}

// 반환: planHint와 같은 모양. 항상 budgetMs + 여유 시간 안에 끝난다.
export function requestPlan(stage, cells, history, solution, { budgetMs, maxStates }) {
  // 워커가 없거나 죽었을 때: 화면이 멈추므로 짧게만 찾는다
  const local = () => planHint(stage, cells, history, solution, { maxStates, budgetMs: Math.min(budgetMs, 250) });
  const w = getWorker();
  if (!w) return Promise.resolve(local());
  return new Promise((resolve) => {
    const id = ++seq;
    let timer = null;
    const finish = (res) => {
      clearTimeout(timer);
      resolve(res || local());
    };
    waiting.set(id, finish);
    timer = setTimeout(() => { if (waiting.has(id)) dropWorker(); }, budgetMs + 1500);
    try {
      w.postMessage({ id, stage, cells, history, solution, opts: { budgetMs, maxStates } });
    } catch {
      waiting.delete(id);
      finish(null);
    }
  });
}
