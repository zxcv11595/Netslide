// 여러 화면이 함께 쓰는 조각: 그림 기호, 아래 탭, 화면 머리줄
import { el, svg } from './art.js';

const PATHS = {
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  gear: ['M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1'],
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
  if (name === 'gear') node.appendChild(svg('circle', { cx: 12, cy: 12, r: 3.2 }));
  if (name === 'cal') node.appendChild(svg('rect', { x: 4, y: 5, width: 16, height: 15, rx: 3 }));
  if (name === 'share') {
    for (const [cx, cy] of [[6, 12], [17, 6], [17, 18]]) node.appendChild(svg('circle', { cx, cy, r: 2.5 }));
  }
  for (const d of PATHS[name] || []) node.appendChild(svg('path', { d }));
  return node;
}

const TABS = [['home', 'home', '홈'], ['daily', 'cal', '오늘의 도전'], ['shop', 'shop', '상점'], ['records', 'chart', '기록']];

// 게임 화면을 뺀 모든 화면 아래에 붙는 탭
export function tabbar(ctx, active) {
  return el('nav', { class: 'tabbar', 'aria-label': '메뉴' }, TABS.map(([key, ic, label]) => el('button', {
    type: 'button', class: key === active ? 'on' : '', 'aria-current': key === active ? 'page' : null,
    onclick: () => { if (key !== active) ctx.go(key); },
  }, [icon(ic), el('span', { text: label })])));
}

// 뒤로 가기 + 가운데 제목 + 오른쪽 조각
export function headRow(title, onBack, right = null) {
  return el('div', { class: 'head-row' }, [
    onBack ? el('button', { class: 'btn sq', type: 'button', 'aria-label': '뒤로', onclick: onBack }, [icon('back')]) : el('div', { class: 'sq-space' }),
    el('h1', { class: 'screen-title', text: title }),
    right || el('div', { class: 'sq-space' }),
  ]);
}

export const pad2 = (n) => String(n).padStart(2, '0');
