// 결과 공유: Web Share API가 있으면 쓰고, 없거나 실패하면 복사. 취소/실패를 성공으로 알리지 않는다.
import { t } from '../i18n.js';
import { el } from './art.js';
import { toast } from './toast.js';

function manualCopyDialog(text) {
  const area = el('textarea', { class: 'copy-area', readonly: true, rows: 4, 'aria-label': t('공유할 내용') });
  area.value = text;
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } }, [
    el('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('직접 복사하기') }, [
      el('p', { text: t('자동으로 복사하지 못했어요. 아래 내용을 직접 복사해 주세요.') }),
      area,
      el('button', { class: 'btn primary', type: 'button', text: t('닫기'), onclick: () => overlay.remove() }),
    ]),
  ]);
  document.body.appendChild(overlay);
  area.focus();
  area.select();
}

// 반환: 'shared' | 'copied' | 'cancelled' | 'manual'
export async function shareResult({ title, text, url }) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled'; // 사용자가 취소: 아무 안내도 하지 않는다
      // 그 밖의 실패는 복사로 넘어간다
    }
  }
  const full = `${text}\n${url}`;
  try {
    await navigator.clipboard.writeText(full);
    toast(t('결과와 링크를 복사했어요'));
    return 'copied';
  } catch {
    manualCopyDialog(full);
    return 'manual';
  }
}
