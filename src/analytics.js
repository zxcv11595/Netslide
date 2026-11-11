// 방문·진행 통계: Google 애널리틱스(파이어베이스 프로젝트 nutslide의 웹 스트림).
// 파이어베이스 SDK 대신 가벼운 gtag만 불러온다. 측정 ID는 CONFIG.analytics.measurementId.
// 보내는 것: 접속, 판 시작(stage_start), 성공(stage_clear: 판·별·횟수), 힌트 사용(hint_use), 구매 창 결과(shop_result).
// 이름·이메일 같은 개인정보는 보내지 않는다. 바꾸거나 더 보낼 때는 개인정보 처리방침(게임 안 화면과 public/privacy.html)부터 고친다.
// 보내지 않는 경우: 개발 서버, 측정 ID가 비어 있을 때, 브라우저에서 '추적 안 함'을 켠 사람.
import { CONFIG } from './config.js';

const id = CONFIG.analytics && CONFIG.analytics.measurementId;
let on = false;

export function initAnalytics() {
  if (!id || typeof document === 'undefined' || on) return;
  if (import.meta.env && import.meta.env.DEV) return; // 개발 중 누른 것이 통계에 섞이지 않게
  // 내 PC나 집 안 주소로 연 것(빌드 미리보기 등)도 세지 않는다. 앱으로 감싼 경우는 주소가 localhost라도 센다.
  if (!window.Capacitor && /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname)) return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); }; // gtag는 arguments 객체 그대로 받아야 한다
  window.gtag('js', new Date());
  window.gtag('config', id, { app_version: CONFIG.version });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s); // 불러오지 못해도(오프라인, 차단) 게임에는 영향이 없다
  on = true;
}

// 진행 한 건을 센다. 통계가 꺼져 있으면 아무 일도 하지 않는다.
export function track(event, params = {}) {
  if (!on) return;
  try { window.gtag('event', event, params); } catch { /* 통계 실패는 게임에 영향을 주지 않는다 */ }
}
