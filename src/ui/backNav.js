// 휴대폰의 뒤로 가기(브라우저 뒤로) 처리. 누르자마자 게임이 꺼지지 않게 방문 기록에 '막는 칸'을 하나 두고,
// 뒤로 가기가 오면 그 칸을 다시 채운 뒤 onBack()에게 맡긴다(창 닫기 → 앞 화면 → 홈에서는 종료 확인).
import { t } from '../i18n.js';
import { el } from './art.js';
import { toast } from './toast.js';
import { sound } from './sound.js';

const GUARD = 'nutslideGuard';

export function installBackNav({ onBack }) {
  let exiting = false;
  const arm = () => { try { history.pushState({ [GUARD]: true }, ''); } catch { /* 기록을 못 쓰는 환경 */ } };
  // 새로 고침(언어 바꾸기 등) 뒤에는 이미 막는 칸 위에 있으므로 또 쌓지 않는다
  if (!history.state || !history.state[GUARD]) arm();
  window.addEventListener('popstate', () => {
    if (exiting) return;
    arm();
    onBack();
  });

  return {
    // 게임을 끝낸다. 앱으로 감싼 경우에는 앱을 닫고, 브라우저에서는 이전 페이지로 나간다.
    // 나갈 곳이 없으면 막는 칸만 풀어 두어 뒤로 가기를 한 번 더 누르면 꺼지게 한다.
    exit() {
      exiting = true;
      const nativeApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (nativeApp && nativeApp.exitApp) { nativeApp.exitApp(); return; }
      history.go(-2); // 막는 칸과 게임 첫 칸을 모두 지나 이전 페이지로
      setTimeout(() => {
        if (document.visibilityState !== 'visible') return;
        history.go(-1); // 이전 페이지가 없었다: 막는 칸만 푼다
        try { window.close(); } catch { /* 스스로 닫을 수 없는 창 */ }
        toast(t('뒤로 가기를 한 번 더 누르면 종료돼요'), 3000);
        setTimeout(() => { exiting = false; arm(); }, 3200); // 안 나갔으면 다시 막는다
      }, 400);
    },
  };
}

// 종료 확인 창. '종료'를 고르면 onExit()을 부른다.
export function openExitDialog(onExit) {
  if (document.querySelector('.exit-sheet')) return;
  const close = () => overlay.remove();
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, [
    el('div', { class: 'modal-card buy-sheet exit-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('게임 종료') }, [
      el('h2', { text: t('게임을 종료할까요?') }),
      el('p', { class: 'sheet-sub', text: t('기록은 저장되어 있어요.') }),
      el('div', { class: 'buy-actions' }, [
        el('button', { class: 'btn', type: 'button', text: t('종료'), onclick: () => { close(); onExit(); } }),
        el('button', { class: 'go', type: 'button', text: t('계속하기@exit'), onclick: close }),
      ]),
    ]),
  ]);
  sound.open?.();
  document.body.appendChild(overlay);
  overlay.querySelector('.go').focus({ preventScroll: true });
}
