// 여러 화면이 함께 쓰는 조각: 그림 기호, 아래 탭, 화면 머리줄
import { t } from '../i18n.js';
import { el, svg } from './art.js';

const PATHS = {
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  // 흔히 쓰는 톱니바퀴 모양(Feather 아이콘의 settings, MIT)
  gear: ['M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'],
  home: ['M4 11l8-7 8 7v9h-5v-6H9v6H4z'],
  cal: ['M4 10h16M8 3v4M16 3v4'],
  shop: ['M5 9h14l-1.2 10.5a1.5 1.5 0 0 1-1.5 1.5H7.7a1.5 1.5 0 0 1-1.5-1.5z', 'M9 9V7a3 3 0 0 1 6 0v2'],
  chart: ['M5 20V11M12 20V4M19 20v-7'],
  undo: ['M9 7L4 12l5 5', 'M4 12h10a5 5 0 0 1 5 5v1'],
  redo: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20 4v5h-5'],
  share: ['M8.2 10.8l6.6-3.6M8.2 13.2l6.6 3.6'],
  bulb: ['M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z', 'M10 20.5h4'],
};

export function icon(name, cls = '') {
  const node = svg('svg', { viewBox: '0 0 24 24', class: `ic ${cls}`.trim(), 'aria-hidden': 'true' });
  if (name === 'play') {
    node.appendChild(svg('path', { d: 'M7 4l14 8-14 8z', fill: 'currentColor', stroke: 'none' }));
    return node;
  }
  if (name === 'lock') {
    node.appendChild(svg('path', { d: 'M7 11V8a5 5 0 0 1 10 0v3' }));
    node.appendChild(svg('rect', { x: 4, y: 11, width: 16, height: 11, rx: 3, fill: 'currentColor' }));
    return node;
  }
  if (name === 'noad') {
    node.appendChild(svg('rect', { x: 3, y: 6, width: 18, height: 12, rx: 3 }));
    node.appendChild(svg('path', { d: 'M4 20L20 4' }));
    return node;
  }
  if (name === 'person') {
    node.appendChild(svg('circle', { cx: 12, cy: 8, r: 4 }));
    node.appendChild(svg('path', { d: 'M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7' }));
    return node;
  }
  if (name === 'gear') { node.classList.add('gear'); node.appendChild(svg('circle', { cx: 12, cy: 12, r: 3 })); }
  if (name === 'cal') node.appendChild(svg('rect', { x: 4, y: 5, width: 16, height: 15, rx: 3 }));
  if (name === 'share') {
    for (const [cx, cy] of [[6, 12], [17, 6], [17, 18]]) node.appendChild(svg('circle', { cx, cy, r: 2.5 }));
  }
  for (const d of PATHS[name] || []) node.appendChild(svg('path', { d }));
  return node;
}

const TABS = [['home', 'home', t('홈')], ['daily', 'cal', t('오늘의 도전@tab')], ['shop', 'shop', t('상점')], ['profile', 'person', t('내 정보')]];

// 게임 화면을 뺀 모든 화면 아래에 붙는 탭
export function tabbar(ctx, active) {
  return el('nav', { class: 'tabbar', 'aria-label': t('메뉴') }, TABS.map(([key, ic, label]) => el('button', {
    type: 'button', class: key === active ? 'on' : '', 'aria-current': key === active ? 'page' : null,
    onclick: () => { if (key !== active) ctx.go(key); },
  }, [icon(ic), el('span', { text: label })])));
}

// 뒤로 가기 + 가운데 제목 + 오른쪽 조각
export function headRow(title, onBack, right = null) {
  return el('div', { class: 'head-row' }, [
    onBack ? el('button', { class: 'btn sq', type: 'button', 'aria-label': t('뒤로'), onclick: onBack }, [icon('back')]) : el('div', { class: 'sq-space' }),
    el('h1', { class: 'screen-title', text: title }),
    right || el('div', { class: 'sq-space' }),
  ]);
}

export const pad2 = (n) => String(n).padStart(2, '0');
