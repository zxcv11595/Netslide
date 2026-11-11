// 방문·진행 통계. 지금은 꺼져 있다: CONFIG.analytics.goatcounter 에 주소를 넣기 전에는 아무것도 보내지 않는다.
// GoatCounter(https://www.goatcounter.com)를 쓴다 — 쿠키를 쓰지 않고 개인을 식별하지 않는 집계 도구다.
// 켜려면: 1) goatcounter.com에서 사이트를 만들고  2) config.js의 analytics.goatcounter에
//         'https://<정한 이름>.goatcounter.com/count' 를 넣고  3) 개인정보 처리방침(게임 안 화면과 public/privacy.html)에
//         "방문 수와 판 진행을 익명으로 집계한다"는 내용을 먼저 넣는다.
// 보내는 것: 화면 이름처럼 쓰는 짧은 경로뿐이다(예: play/B03, clear/B03/3, hint/walls, buy/hints20/ok).
import { CONFIG } from './config.js';

const endpoint = CONFIG.analytics && CONFIG.analytics.goatcounter;
const queue = [];
let ready = false;

function flush() {
  while (queue.length) {
    const path = queue.shift();
    try { window.goatcounter.count({ path, title: path, event: true }); } catch { /* 통계 실패는 게임에 영향을 주지 않는다 */ }
  }
}

export function initAnalytics() {
  if (!endpoint || typeof document === 'undefined') return;
  window.goatcounter = { no_onload: true }; // 화면 전환이 주소를 바꾸지 않으므로 방문도 직접 센다
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = endpoint;
  s.onload = () => {
    ready = true;
    try { window.goatcounter.count({ path: 'open' }); } catch { /* 무시 */ }
    flush();
  };
  document.head.appendChild(s);
}

// 진행 한 건을 센다. 통계가 꺼져 있으면 아무 일도 하지 않는다.
export function track(path) {
  if (!endpoint) return;
  queue.push(path);
  if (ready) flush();
  else if (queue.length > 50) queue.shift();
}
