// 보드 SVG 렌더링과 연출. 규칙 판정은 하지 않고 넘겨받은 cells/conn만 그린다.
import { N, E, S, W, DIRS, tilePorts, isLineLocked, pathTo } from '../core/rules.js';
import { CONFIG } from '../config.js';
import { svg, hamsterFace, seedSprite, starPath, COLORS, prefersReducedMotion } from './art.js';
import { createTransitionLock } from './transitionLock.js';

const C = 100; // 칸 크기
const BTN = 62; // 가장자리 버튼
const GAP = 8;
const PAD = 10;
const OFF = BTN + GAP + PAD; // 보드 시작 좌표

const EDGE = { [N]: [50, 0], [E]: [100, 50], [S]: [50, 100], [W]: [0, 50] };
const ANGLE = { [N]: -90, [E]: 0, [S]: 90, [W]: 180 };
const DIR_NAME = { [N]: '위로', [E]: '오른쪽으로', [S]: '아래로', [W]: '왼쪽으로' };

function pipePath(mask) {
  return DIRS.filter((d) => mask & d).map((d) => `M50 50L${EDGE[d][0]} ${EDGE[d][1]}`).join('');
}

function pipeLayers(mask) {
  const d = pipePath(mask);
  const g = svg('g', { class: 'pipe' });
  if (!d) return g;
  g.appendChild(svg('path', { d, class: 'pipe-wall' }));
  g.appendChild(svg('circle', { cx: 50, cy: 50, r: 12, class: 'pipe-wall-dot' }));
  g.appendChild(svg('path', { d, class: 'pipe-core' }));
  g.appendChild(svg('circle', { cx: 50, cy: 50, r: 5, class: 'pipe-core-dot' }));
  // 흐름 표시(색 + 가운데 밝은 줄)
  const flow = svg('g', { class: 'flow' });
  flow.appendChild(svg('path', { d, class: 'flow-core' }));
  flow.appendChild(svg('circle', { cx: 50, cy: 50, r: 6.5, class: 'flow-core-dot' }));
  flow.appendChild(svg('path', { d, class: 'flow-shine' }));
  g.appendChild(flow);
  return g;
}

function buildTile(tile, id) {
  const outer = svg('g', { class: `tile kind-${tile.kind}${tile.bonus ? ' bonus' : ''}`, 'data-id': id });
  const mv = svg('g', { class: 'mv' });
  outer.appendChild(mv);
  mv.appendChild(svg('rect', { x: 3, y: 3, width: 94, height: 94, rx: 16, class: 'tile-bg' }));
  mv.appendChild(pipeLayers(tilePorts(tile)));

  if (tile.kind === 'source') {
    outer.classList.add('lit');
    mv.appendChild(svg('circle', { cx: 50, cy: 50, r: 29, class: 'source-plate' }));
    const seed = seedSprite(50);
    seed.setAttribute('transform', 'translate(50 50)');
    mv.appendChild(seed);
  } else if (tile.kind === 'goal') {
    const face = hamsterFace();
    face.setAttribute('transform', 'translate(50 52)');
    mv.appendChild(face);
    if (tile.bonus) {
      // 보너스: 점선 테두리 + 별 배지(색 외에 모양으로도 구분)
      const badge = svg('g', { transform: 'translate(63 5) scale(1.25)', class: 'bonus-badge' });
      badge.appendChild(starPath({ 'stroke-linejoin': 'round', 'stroke-width': 1.8 }));
      mv.appendChild(badge);
    }
  } else if (tile.kind === 'oneway') {
    // 방향 타일: 입구 → 출구 화살표
    const arrow = svg('g', { transform: `translate(50 50) rotate(${ANGLE[tile.out]})`, class: 'oneway-arrow' });
    arrow.appendChild(svg('path', { d: 'M-12 -13 L13 0 L-12 13 Z', 'stroke-linejoin': 'round' }));
    mv.appendChild(arrow);
    const [ix, iy] = EDGE[tile.in];
    const tick = svg('g', { transform: `translate(${50 + (ix - 50) * 0.62} ${50 + (iy - 50) * 0.62}) rotate(${ANGLE[oppositeOf(tile.in)]})`, class: 'oneway-tick' });
    tick.appendChild(svg('path', { d: 'M-5 -7 L5 0 L-5 7', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    mv.appendChild(tick);
  }
  return outer;
}

function oppositeOf(d) { return { [N]: S, [S]: N, [E]: W, [W]: E }[d]; }

function arrowIcon(dir) {
  return svg('path', {
    d: 'M-13 0H11M2 -10L12 0L2 10', class: 'btn-arrow', transform: `rotate(${ANGLE[dir]})`,
  });
}

function lockIcon() {
  const g = svg('g', { class: 'btn-lock' });
  g.appendChild(svg('path', { d: 'M-7 -3 V-8 a7 7 0 0 1 14 0 V-3', fill: 'none' }));
  g.appendChild(svg('rect', { x: -11, y: -3, width: 22, height: 17, rx: 4 }));
  return g;
}

// options: { stage, onMove(move), onLockedTap() }
export function createBoard({ stage, onMove, onLockedTap }) {
  const n = stage.size;
  const T = n * C + OFF * 2;
  const lock = createTransitionLock();
  const anims = new Set();
  const temps = new Set();
  let raf = 0;
  let destroyed = false;
  let disabled = false;
  let litPrev = new Set();

  const root = svg('svg', {
    viewBox: `0 0 ${T} ${T}`, class: 'board', role: 'group', 'aria-label': `${n}×${n} 퍼즐 판`,
  });
  const clipId = `clip-${Math.random().toString(36).slice(2, 8)}`;
  root.appendChild(svg('defs', {}, [
    svg('clipPath', { id: clipId }, [svg('rect', { x: OFF, y: OFF, width: n * C, height: n * C, rx: 14 })]),
  ]));
  root.appendChild(svg('rect', {
    x: OFF - PAD, y: OFF - PAD, width: n * C + PAD * 2, height: n * C + PAD * 2, rx: 24, class: 'board-frame',
  }));
  const tilesLayer = svg('g', { 'clip-path': `url(#${clipId})` });
  const tilesInner = svg('g', { transform: `translate(${OFF} ${OFF})` });
  tilesLayer.appendChild(tilesInner);
  root.appendChild(tilesLayer);
  const btnLayer = svg('g', { class: 'btns' });
  root.appendChild(btnLayer);
  const fxLayer = svg('g', { class: 'fx', transform: `translate(${OFF} ${OFF})`, 'pointer-events': 'none' });
  root.appendChild(fxLayer);

  const tileEls = stage.tiles.map((t, id) => {
    const node = buildTile(t, id);
    tilesInner.appendChild(node);
    return node;
  });

  // ----- 가장자리 버튼 -----
  function addButton(axis, index, dir, cx, cy, arrowDir) {
    const locked = isLineLocked(stage, axis, index);
    const lineName = axis === 'row' ? `${index + 1}번째 가로줄` : `${index + 1}번째 세로줄`;
    const label = locked
      ? `${lineName}: 간식 창고가 있어 움직이지 않는 줄`
      : `${lineName}을 ${DIR_NAME[arrowDir]} 한 칸 밀기`;
    const g = svg('g', {
      class: `edge-btn${locked ? ' locked' : ''}`, transform: `translate(${cx} ${cy})`,
      role: 'button', tabindex: 0, 'aria-label': label, 'aria-disabled': locked ? 'true' : null,
    });
    // 누르기 쉬운 넓은 hit area (칸 간격 전체 × 바깥 여백)
    const hw = axis === 'row' ? OFF - 4 : C;
    const hh = axis === 'row' ? C : OFF - 4;
    g.appendChild(svg('rect', { x: -hw / 2, y: -hh / 2, width: hw, height: hh, class: 'btn-hit' }));
    g.appendChild(svg('rect', { x: -BTN / 2, y: -BTN / 2, width: BTN, height: BTN, rx: 16, class: 'btn-face' }));
    g.appendChild(locked ? lockIcon() : arrowIcon(arrowDir));
    const fire = () => {
      if (destroyed || disabled) return;
      if (locked) {
        g.classList.remove('shake');
        void g.getBoundingClientRect();
        g.classList.add('shake');
        onLockedTap?.();
        return;
      }
      if (lock.locked) return; // 이동 연출 중에는 입력을 받지 않는다
      onMove({ axis, index, dir });
    };
    g.addEventListener('click', fire);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
    });
    btnLayer.appendChild(g);
  }
  const edgeNear = BTN / 2;
  const edgeFar = T - BTN / 2;
  for (let i = 0; i < n; i++) {
    const mid = OFF + i * C + C / 2;
    addButton('row', i, 1, edgeNear, mid, E); // 왼쪽 버튼: 오른쪽으로 밀기
    addButton('row', i, -1, edgeFar, mid, W);
    addButton('col', i, 1, mid, edgeNear, S); // 위쪽 버튼: 아래로 밀기
    addButton('col', i, -1, mid, edgeFar, N);
  }

  // ----- 배치/흐름 -----
  function layout(cells) {
    for (let pos = 0; pos < cells.length; pos++) {
      tileEls[cells[pos]].setAttribute('transform', `translate(${(pos % n) * C} ${Math.floor(pos / n) * C})`);
    }
  }

  // 공급원에서 가까운 칸부터 켠다. 이미 켜져 있던 타일은 그대로 두고 새로 켜지는 타일만 순서대로.
  function setFlow(cells, conn, { instant = false } = {}) {
    const reduce = instant || prefersReducedMotion();
    const lit = new Map();
    for (let pos = 0; pos < cells.length; pos++) if (conn.reached[pos]) lit.set(cells[pos], conn.dist[pos]);
    let minNew = Infinity;
    for (const [id, d] of lit) if (!litPrev.has(id)) minNew = Math.min(minNew, d);
    tileEls.forEach((node, id) => {
      const on = lit.has(id);
      const delay = on && !litPrev.has(id) && !reduce
        ? Math.min((lit.get(id) - minNew) * CONFIG.anim.flowStep, CONFIG.anim.flowMax) : 0;
      node.style.setProperty('--flow-delay', `${delay}ms`);
      node.classList.toggle('lit', on);
    });
    litPrev = new Set(lit.keys());
  }

  function clearTemps() {
    for (const a of anims) { try { a.cancel(); } catch { /* 무시 */ } }
    anims.clear();
    for (const t of temps) t.remove();
    temps.clear();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  // 한 칸 줄 이동 연출. 논리 상태(newCells)는 이미 확정되어 있다.
  // 경계를 넘는 타일은 임시 복제를 만들어 반대편에서 들어오게 하고 보드 밖은 잘라낸다.
  function animateShift(prevCells, move, newCells, conn, done) {
    const finish = () => {
      clearTemps();
      if (destroyed) return;
      layout(newCells);
      setFlow(newCells, conn); // 이동이 끝난 뒤 새 배치 기준으로 흐름 표시
      done?.();
    };
    if (prefersReducedMotion() || typeof root.animate !== 'function') { finish(); return; }
    const release = lock.begin(CONFIG.anim.shiftFallback, finish);
    const dx = move.axis === 'row' ? move.dir * C : 0;
    const dy = move.axis === 'col' ? move.dir * C : 0;
    const frames = [{ transform: 'translate(0px, 0px)' }, { transform: `translate(${dx}px, ${dy}px)` }];
    const opts = { duration: CONFIG.anim.shift, easing: 'cubic-bezier(.3,.75,.35,1)', fill: 'forwards' };
    let last = null;
    for (let i = 0; i < n; i++) {
      const pos = move.axis === 'row' ? move.index * n + i : i * n + move.index;
      const node = tileEls[prevCells[pos]];
      const wraps = move.dir === 1 ? i === n - 1 : i === 0;
      if (wraps) {
        const clone = node.cloneNode(true);
        const ci = move.dir === 1 ? -1 : n;
        const cxp = move.axis === 'row' ? ci * C : move.index * C;
        const cyp = move.axis === 'row' ? move.index * C : ci * C;
        clone.setAttribute('transform', `translate(${cxp} ${cyp})`);
        clone.removeAttribute('data-id');
        tilesInner.appendChild(clone);
        temps.add(clone);
        const a = clone.querySelector('.mv').animate(frames, opts);
        anims.add(a);
      }
      last = node.querySelector('.mv').animate(frames, opts);
      anims.add(last);
    }
    last.finished.then(release, () => {});
  }

  // 완료 연출: 연결 판정에서 얻은 실제 경로를 따라 간식이 이동한다.
  function playDelivery(cells, conn, done) {
    const goals = conn.goals.filter((g) => g.connected);
    const routes = goals.map((g) => pathTo(conn, g.pos)).filter(Boolean).map((p) => p.map((pos) => [
      (pos % n) * C + C / 2, Math.floor(pos / n) * C + C / 2,
    ]));
    const finish = () => { clearTemps(); if (!destroyed) done?.(); };
    if (prefersReducedMotion() || !routes.length) { finish(); return; }
    const duration = CONFIG.anim.delivery;
    const release = lock.begin(duration + 400, finish);
    const seeds = routes.map((pts) => {
      const seg = [0];
      for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const node = seedSprite(46);
      fxLayer.appendChild(node);
      temps.add(node);
      return { pts, seg, total: seg[seg.length - 1], node };
    });
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
      for (const s of seeds) {
        const at = e * s.total;
        let i = 1;
        while (i < s.seg.length - 1 && s.seg[i] < at) i++;
        const span = s.seg[i] - s.seg[i - 1] || 1;
        const k = Math.max(0, Math.min(1, (at - s.seg[i - 1]) / span));
        const x = s.pts[i - 1][0] + (s.pts[i][0] - s.pts[i - 1][0]) * k;
        const y = s.pts[i - 1][1] + (s.pts[i][1] - s.pts[i - 1][1]) * k;
        s.node.setAttribute('transform', `translate(${x} ${y}) scale(${t > 0.85 ? 1 - (t - 0.85) * 3 : 1})`);
      }
      if (t < 1) raf = requestAnimationFrame(step);
      else { raf = 0; release(); }
    };
    raf = requestAnimationFrame(step);
  }

  return {
    el: root,
    get busy() { return lock.locked; },
    // 연출 없이 현재 상태를 그대로 그린다(처음, 재시작, 복원)
    render(cells, conn, { instant = false } = {}) {
      lock.cancel();
      clearTemps();
      layout(cells);
      setFlow(cells, conn, { instant });
    },
    animateShift,
    playDelivery,
    setDisabled(v) {
      disabled = v;
      root.classList.toggle('disabled', v);
    },
    destroy() {
      destroyed = true;
      lock.cancel();
      clearTemps();
      root.remove();
    },
  };
}
