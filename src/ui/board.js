// 보드 SVG 렌더링과 연출(땅속 굴 디자인). 규칙 판정은 하지 않고 넘겨받은 cells/conn만 그린다.
import { N, E, S, W, DIRS, tilePorts, isLineLocked } from '../core/rules.js';
import { CONFIG } from '../config.js';
import { svg, hamsterFace, seedSprite, prefersReducedMotion } from './art.js';
import { createTransitionLock } from './transitionLock.js';

const C = 100; // 칸 크기
const BTN = 62; // 가장자리 버튼
const GAP = 8;
const PAD = 12;
const OFF = BTN + GAP + PAD; // 보드 시작 좌표

const EDGE = { [N]: [50, 0], [E]: [100, 50], [S]: [50, 100], [W]: [0, 50] };
const ANGLE = { [N]: -90, [E]: 0, [S]: 90, [W]: 180 };
const DIR_NAME = { [N]: '위로', [E]: '오른쪽으로', [S]: '아래로', [W]: '왼쪽으로' };
const OPPOSITE = { [N]: S, [S]: N, [E]: W, [W]: E };

function pipePath(mask) {
  return DIRS.filter((d) => mask & d).map((d) => `M50 50L${EDGE[d][0]} ${EDGE[d][1]}`).join('');
}

// 굴: 어두운 테두리 + 밝은 흙길. 간식이 흐르면 주황색 + 씨앗 점선(색 외에 모양으로도 구분).
function tunnelLayers(mask, chamber) {
  const d = pipePath(mask);
  const g = svg('g', { class: 'pipe' });
  if (d) {
    g.appendChild(svg('path', { d, class: 'tunnel-edge' }));
    g.appendChild(svg('circle', { cx: 50, cy: 50, r: 19, class: 'tunnel-edge-dot' }));
  }
  if (chamber) g.appendChild(svg('circle', { cx: 50, cy: 50, r: 42, class: 'tunnel-edge-dot' }));
  if (d) {
    g.appendChild(svg('path', { d, class: 'tunnel' }));
    g.appendChild(svg('circle', { cx: 50, cy: 50, r: 15, class: 'tunnel-dot' }));
  }
  if (chamber) g.appendChild(svg('circle', { cx: 50, cy: 50, r: 38, class: 'tunnel-dot chamber' }));
  const flow = svg('g', { class: 'flow' });
  if (d) {
    flow.appendChild(svg('path', { d, class: 'flow-tunnel' }));
    flow.appendChild(svg('circle', { cx: 50, cy: 50, r: 15, class: 'flow-dot' }));
  }
  if (chamber) flow.appendChild(svg('circle', { cx: 50, cy: 50, r: 38, class: 'flow-dot' }));
  if (d) flow.appendChild(svg('path', { d, class: 'flow-seeds' }));
  g.appendChild(flow);
  return g;
}

function buildTile(tile, id) {
  const mask = tilePorts(tile);
  const outer = svg('g', { class: `tile kind-${tile.kind}${mask ? '' : ' blank'}`, 'data-id': id });
  const mv = svg('g', { class: 'mv' });
  outer.appendChild(mv);
  mv.appendChild(svg('rect', { x: 3, y: 3, width: 94, height: 94, rx: 12, class: 'tile-bg' }));
  mv.appendChild(tunnelLayers(mask, tile.kind === 'source' || tile.kind === 'goal'));

  if (tile.kind === 'source') {
    outer.classList.add('lit');
    const seed = seedSprite(52);
    seed.setAttribute('transform', 'translate(50 50)');
    mv.appendChild(seed);
  } else if (tile.kind === 'goal') {
    const face = hamsterFace();
    face.setAttribute('transform', 'translate(50 53) scale(0.92)');
    mv.appendChild(face);
    // 길이 닿은 햄스터 표시(웃는 얼굴 + 초록 체크)
    const ok = svg('g', { class: 'ok-badge' });
    ok.appendChild(svg('circle', { cx: 82, cy: 18, r: 13 }));
    ok.appendChild(svg('path', { d: 'M76 18l4.5 4.5L88 14' }));
    mv.appendChild(ok);
  } else if (tile.kind === 'oneway') {
    // 방향 타일(현재 출시 판에서는 쓰지 않음): 입구 → 출구 화살표
    const arrow = svg('g', { transform: `translate(50 50) rotate(${ANGLE[tile.out]})`, class: 'oneway-arrow' });
    arrow.appendChild(svg('path', { d: 'M-12 -13 L13 0 L-12 13 Z', 'stroke-linejoin': 'round' }));
    mv.appendChild(arrow);
    const [ix, iy] = EDGE[tile.in];
    const tick = svg('g', { transform: `translate(${50 + (ix - 50) * 0.62} ${50 + (iy - 50) * 0.62}) rotate(${ANGLE[OPPOSITE[tile.in]]})`, class: 'oneway-tick' });
    tick.appendChild(svg('path', { d: 'M-5 -7 L5 0 L-5 7', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    mv.appendChild(tick);
  }
  return outer;
}

function arrowIcon(dir) {
  return svg('path', { d: 'M-13 0H11M2 -10L12 0L2 10', class: 'btn-arrow', transform: `rotate(${ANGLE[dir]})` });
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
  let destroyed = false;
  let disabled = false;
  let litPrev = new Set();

  const root = svg('svg', {
    viewBox: `0 0 ${T} ${T}`, class: 'board', role: 'group', 'aria-label': `${n}×${n} 퍼즐 판`,
  });
  const clipId = `clip-${Math.random().toString(36).slice(2, 8)}`;
  root.appendChild(svg('defs', {}, [
    svg('clipPath', { id: clipId }, [svg('rect', { x: OFF, y: OFF, width: n * C, height: n * C, rx: 10 })]),
  ]));
  root.appendChild(svg('rect', {
    x: OFF - PAD, y: OFF - PAD, width: n * C + PAD * 2, height: n * C + PAD * 2, rx: 22, class: 'board-frame',
  }));
  const tilesLayer = svg('g', { 'clip-path': `url(#${clipId})` });
  const tilesInner = svg('g', { transform: `translate(${OFF} ${OFF})` });
  tilesLayer.appendChild(tilesInner);
  root.appendChild(tilesLayer);
  const btnLayer = svg('g', { class: 'btns' });
  root.appendChild(btnLayer);

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
    g.appendChild(svg('rect', { x: -BTN / 2, y: -BTN / 2 + 5, width: BTN, height: BTN, rx: 12, class: 'btn-shadow' }));
    g.appendChild(svg('rect', { x: -BTN / 2, y: -BTN / 2, width: BTN, height: BTN, rx: 12, class: 'btn-face' }));
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
  const edgeFar = T - BTN / 2 - 5;
  for (let i = 0; i < n; i++) {
    const mid = OFF + i * C + C / 2;
    addButton('row', i, 1, edgeNear, mid, E); // 왼쪽 버튼: 오른쪽으로 밀기
    addButton('row', i, -1, T - BTN / 2, mid, W);
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
        anims.add(clone.querySelector('.mv').animate(frames, opts));
      }
      last = node.querySelector('.mv').animate(frames, opts);
      anims.add(last);
    }
    last.finished.then(release, () => {});
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
    setDisabled(v) {
      disabled = v;
      root.classList.toggle('disabled', v);
    },
    // 완료 순간: 굴 전체가 한 번 반짝인다
    celebrate() { root.classList.add('all-done'); },
    destroy() {
      destroyed = true;
      lock.cancel();
      clearTemps();
      root.remove();
    },
  };
}
