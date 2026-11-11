// 힌트 길 찾기를 화면과 다른 스레드에서 돌린다(최대 1초라 화면이 멈추지 않게).
import { planHint, warmHint } from './hint.js';

self.onmessage = (e) => {
  const { id, stage, cells, history, solution, opts } = e.data;
  if (e.data.warm) { try { warmHint(stage, solution); } catch { /* 무시 */ } return; }
  let res;
  try { res = planHint(stage, cells, history, solution, opts); } catch { res = { type: 'none' }; }
  self.postMessage({ id, res });
};
