// 코드로 그리는 그림 조각(SVG)과 제공 이미지 표시. 이미지가 없으면 코드 그림으로 대체한다.
import { CONFIG } from '../config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.appendChild(c);
  return el;
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export const COLORS = {
  ink: '#5a3418',
  orange: '#f28c28',
  fur: '#f9b45c',
  cream: '#fff1da',
  pink: '#f7a8a0',
};

// 작은 목표용 햄스터 얼굴. 중심 (0,0), 반지름 약 28.
export function hamsterFace() {
  const g = svg('g', { class: 'face' });
  for (const sx of [-1, 1]) {
    g.appendChild(svg('circle', { cx: sx * 18, cy: -18, r: 9.5, fill: COLORS.fur, stroke: COLORS.ink, 'stroke-width': 3 }));
    g.appendChild(svg('circle', { cx: sx * 18, cy: -18, r: 4.5, fill: COLORS.pink }));
  }
  g.appendChild(svg('ellipse', { cx: 0, cy: 0, rx: 27, ry: 23.5, fill: COLORS.fur, stroke: COLORS.ink, 'stroke-width': 3 }));
  g.appendChild(svg('ellipse', { cx: 0, cy: 8, rx: 18, ry: 13, fill: COLORS.cream }));
  for (const sx of [-1, 1]) g.appendChild(svg('ellipse', { cx: sx * 17, cy: 7, rx: 4.5, ry: 2.8, fill: COLORS.pink }));
  const open = svg('g', { class: 'eyes-open' });
  for (const sx of [-1, 1]) open.appendChild(svg('circle', { cx: sx * 9.5, cy: -2, r: 3.4, fill: COLORS.ink }));
  const happy = svg('g', { class: 'eyes-happy', fill: 'none', stroke: COLORS.ink, 'stroke-width': 3, 'stroke-linecap': 'round' });
  for (const sx of [-1, 1]) happy.appendChild(svg('path', { d: `M${sx * 9.5 - 4.5} -1 q4.5 -6 9 0` }));
  g.appendChild(open);
  g.appendChild(happy);
  g.appendChild(svg('path', {
    d: 'M-4.5 6.5 q2.25 3.5 4.5 0 q2.25 3.5 4.5 0', fill: 'none', stroke: COLORS.ink, 'stroke-width': 2.4, 'stroke-linecap': 'round',
  }));
  return g;
}

// 코드로 그린 간식(이미지 누락 시 대체). 중심 (0,0), 크기 약 size.
export function seedShape(size = 44) {
  const s = size / 44;
  const g = svg('g', { transform: `rotate(35) scale(${s})` });
  g.appendChild(svg('path', { d: 'M0 -21 C12 -12 13 10 0 21 C-13 10 -12 -12 0 -21 Z', fill: '#8a5a33', stroke: COLORS.ink, 'stroke-width': 3, 'stroke-linejoin': 'round' }));
  g.appendChild(svg('path', { d: 'M-4 -13 C-7 -3 -7 6 -3 14 M4 -13 C7 -3 7 6 3 14', fill: 'none', stroke: '#ffe9bd', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  return g;
}

// 간식: 제공 이미지를 쓰고, 불러오지 못하면 코드 그림으로 바꾼다. 중심 (0,0).
export function seedSprite(size = 48) {
  const g = svg('g', { class: 'seed' });
  const img = svg('image', {
    href: CONFIG.assets.snackSeed, x: -size / 2, y: -size / 2, width: size, height: size,
    preserveAspectRatio: 'xMidYMid meet',
  });
  img.addEventListener('error', () => { img.remove(); g.appendChild(seedShape(size * 0.8)); }, { once: true });
  g.appendChild(img);
  return g;
}

const STAR_D = 'M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z';
export function starIcon(filled, size = 24) {
  return svg('svg', { viewBox: '0 0 24 24', width: size, height: size, class: `star ${filled ? 'on' : 'off'}`, 'aria-hidden': 'true' }, [
    svg('path', { d: STAR_D, 'stroke-linejoin': 'round', 'stroke-width': 1.8 }),
  ]);
}
export function starPath(attrs = {}) { return svg('path', { d: STAR_D, ...attrs }); }

export function starsRow(count, total = 3, size = 20) {
  const row = el('span', { class: 'stars-row', role: 'img', 'aria-label': `별 ${count}개` });
  for (let i = 0; i < total; i++) row.appendChild(starIcon(i < count, size));
  return row;
}

// 큰 햄스터 대체 그림(이미지 누락 시): 얼굴만 크게.
function hamsterFallback() {
  return svg('svg', { viewBox: '-40 -40 80 80', class: 'hamster-fallback', 'aria-hidden': 'true' }, [hamsterFace()]);
}

// 대기/성공 이미지를 같은 고정 프레임(원본 비율 1312:1199)에 겹쳐 둔다.
// 두 이미지는 같은 캔버스 크기라 발 기준선이 유지된다.
export function hamsterFrame({ withSuccess = false, cls = '' } = {}) {
  const frame = el('div', { class: `hamster-frame ${cls}`.trim(), 'aria-hidden': 'true' });
  const add = (src, c) => {
    const img = el('img', { src, alt: '', class: c, draggable: 'false', decoding: 'async' });
    img.addEventListener('error', () => {
      img.remove();
      if (!frame.querySelector('.hamster-fallback')) frame.appendChild(hamsterFallback());
      frame.classList.add('fallback');
    }, { once: true });
    frame.appendChild(img);
  };
  add(CONFIG.assets.hamsterIdle, 'h-idle');
  if (withSuccess) add(CONFIG.assets.hamsterSuccess, 'h-success');
  return frame;
}

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
