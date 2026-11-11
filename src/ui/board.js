// 보드 SVG 렌더링과 연출(밝은 원목 위의 나무 길). 배치와 판정은 넘겨받은 상태를 그대로 쓴다.
import { t } from '../i18n.js';
import { N, E, S, W, DIRS, tilePorts, isLineLocked } from '../core/rules.js';
import { CONFIG } from '../config.js';
import { svg, hamsterFace, seedSprite, prefersReducedMotion } from './art.js';
import { createTransitionLock } from './transitionLock.js';

const C = 100; // 칸 크기
const BTN = 54; // 가장자리 버튼
const GAP = 6;
const PAD = 10;
const OFF = BTN + GAP + PAD; // 보드 시작 좌표

const EDGE = { [N]: [50, 0], [E]: [100, 50], [S]: [50, 100], [W]: [0, 50] };
const ANGLE = { [N]: -90, [E]: 0, [S]: 90, [W]: 180 };
const DIR_NAME = { [N]: t('위로'), [E]: t('오른쪽으로'), [S]: t('아래로'), [W]: t('왼쪽으로') };
const OPPOSITE = { [N]: S, [S]: N, [E]: W, [W]: E };

function pipePath(mask) {
  return DIRS.filter((d) => mask & d).map((d) => `M50 50L${EDGE[d][0]} ${EDGE[d][1]}`).join('');
}

// 나무 길: 아래쪽 두께 + 밝은 윗면. 연결 상태는 따뜻한 꿀색과 도토리 표시로 구분한다.
function tunnelLayers(mask, chamber) {
  const d = pipePath(mask);
  const g = svg('g', { class: 'pipe' });
  if (d) {
    g.appendChild(svg('path', { d, class: 'walk-shadow' }));
    g.appendChild(svg('path', { d, class: 'tunnel-edge' }));
    g.appendChild(svg('circle', { cx: 50, cy: 50, r: 16.5, class: 'tunnel-edge-dot' }));
  }
  if (chamber) g.appendChild(svg('circle', { cx: 50, cy: 50, r: 41, class: 'tunnel-edge-dot' }));
  if (d) {
    g.appendChild(svg('path', { d, class: 'tunnel' }));
    g.appendChild(svg('circle', { cx: 50, cy: 50, r: 14, class: 'tunnel-dot' }));
  }
  if (chamber) g.appendChild(svg('circle', { cx: 50, cy: 50, r: 36.5, class: 'tunnel-dot chamber' }));
  const flow = svg('g', { class: 'flow' });
  if (d) {
    flow.appendChild(svg('path', { d, class: 'flow-tunnel' }));
    flow.appendChild(svg('circle', { cx: 50, cy: 50, r: 13.5, class: 'flow-dot' }));
  }
  if (chamber) flow.appendChild(svg('circle', { cx: 50, cy: 50, r: 36.5, class: 'flow-dot' }));
  if (d) flow.appendChild(svg('path', { d, class: 'flow-seeds' }));
  g.appendChild(flow);
  // 이전의 둥근 길 모양은 유지하고, 표면에만 옅은 목재 잔결을 더한다.
  const surface = svg('g', { class: 'walk-surface-grain' });
  for (const dir of DIRS.filter((dir) => mask & dir)) {
    surface.appendChild(svg('path', {
      d: 'M6 -6Q16 -8 26 -6T46 -6M17 7Q31 5 46 8',
      transform: `translate(50 50) rotate(${ANGLE[dir]})`,
    }));
  }
  g.appendChild(surface);
  return g;
}

// 타일 속 햄스터: 제공된 그림의 얼굴 부분을 그대로 쓴다(대기/성공). 이미지를 못 불러오면 코드 얼굴로 대체.
function photoFace(clipId) {
  const g = svg('g', { class: 'face-photo', transform: 'translate(50 51) scale(0.98)' });
  g.appendChild(svg('clipPath', { id: clipId }, [svg('circle', { r: 30 })]));
  const inner = svg('g', { 'clip-path': `url(#${clipId})` });
  const fallback = () => {
    if (g.classList.contains('fallback')) return;
    g.classList.add('fallback');
    g.replaceChildren(hamsterFace());
    g.setAttribute('transform', 'translate(50 53) scale(0.92)');
  };
  for (const [cls, src, box] of [['face-idle', CONFIG.assets.hamsterIdle, '118 28 420 420'], ['face-happy', CONFIG.assets.hamsterSuccess, '118 20 420 420']]) {
    const part = svg('svg', { x: -32, y: -34, width: 64, height: 64, viewBox: box, class: cls });
    const img = svg('image', { href: src, width: 656, height: 600 });
    img.addEventListener('error', fallback, { once: true });
    part.appendChild(img);
    inner.appendChild(part);
  }
  g.appendChild(inner);
  return g;
}

function buildTile(tile, id, clipKey) {
  const mask = tilePorts(tile);
  const outer = svg('g', { class: `tile kind-${tile.kind}${mask ? '' : ' blank'}`, 'data-id': id });
  const mv = svg('g', { class: 'mv' });
  outer.appendChild(mv);
  mv.appendChild(svg('rect', { x: 3, y: 3, width: 94, height: 94, rx: 14, class: 'tile-bg' }));
  // 얕은 결은 타일 표면에만 놓는다. 길 한가운데 점선을 그려 도로/굴처럼 보이지 않게 한다.
  const grain = svg('g', { class: 'wood-grain', transform: id % 2 ? 'rotate(180 50 50)' : '' });
  grain.appendChild(svg('path', { d: 'M12 18Q29 14 45 18T86 18M17 23Q33 20 48 23M12 81Q33 77 52 81T87 81M61 86Q75 83 87 86' }));
  mv.appendChild(grain);
  mv.appendChild(tunnelLayers(mask, tile.kind === 'source' || tile.kind === 'goal'));

  if (tile.kind === 'source') {
    // 가운데 칸은 햄스터: 길이 모든 도토리에 닿으면 웃는 얼굴로 바뀐다(보드의 all-done)
    outer.classList.add('lit');
    mv.appendChild(photoFace(`${clipKey}-f${id}`));
  } else if (tile.kind === 'goal') {
    // 가지 끝은 도토리: 길이 닿으면 반짝이며 커진다
    const acorn = seedSprite(52);
    acorn.setAttribute('transform', 'translate(50 50)');
    mv.appendChild(acorn);
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
  const btnMap = new Map();

  const root = svg('svg', {
    viewBox: `0 0 ${T} ${T}`, class: 'board', role: 'group', 'aria-label': t('{n}×{n} 퍼즐 판', { n }),
  });
  const clipId = `clip-${Math.random().toString(36).slice(2, 8)}`;
  root.style.setProperty('--wood-tile', `url(#${clipId}-tile)`);
  root.style.setProperty('--wood-walk', `url(#${clipId}-walk)`);
  root.style.setProperty('--wood-rim', `url(#${clipId}-rim)`);
  root.appendChild(svg('defs', {}, [
    svg('clipPath', { id: clipId }, [svg('rect', { x: OFF, y: OFF, width: n * C, height: n * C, rx: 10 })]),
    ...[
      ['tile', '#edddbf', '#dcc29a'],
      ['walk', '#ffedbf', '#edc98b'],
      ['rim', '#ddbd8c', '#b98c55'],
    ].map(([name, top, bottom]) => svg('linearGradient', {
      id: `${clipId}-${name}`, x1: 0, y1: 0, x2: 0, y2: 100, gradientUnits: 'userSpaceOnUse',
    }, [svg('stop', { offset: '0%', 'stop-color': top }), svg('stop', { offset: '100%', 'stop-color': bottom })])),
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
    const node = buildTile(t, id, clipId);
    tilesInner.appendChild(node);
    return node;
  });

  // ----- 가장자리 버튼 -----
  function addButton(axis, index, dir, cx, cy, arrowDir) {
    const locked = isLineLocked(stage, axis, index);
    const lineName = axis === 'row' ? t('{n}번째 가로줄', { n: index + 1 }) : t('{n}번째 세로줄', { n: index + 1 });
    const label = locked
      ? t('{line}: 햄스터가 있어 움직이지 않는 줄', { line: lineName })
      : t('{line}을 {dir} 한 칸 밀기', { line: lineName, dir: DIR_NAME[arrowDir] });
    const g = svg('g', {
      class: `edge-btn${locked ? ' locked' : ''}`, transform: `translate(${cx} ${cy})`,
      role: 'button', tabindex: 0, 'aria-label': label, 'aria-disabled': locked ? 'true' : null,
    });
    // 누르기 쉬운 넓은 hit area (칸 간격 전체 × 바깥 여백)
    const hw = axis === 'row' ? OFF - 4 : C;
    const hh = axis === 'row' ? C : OFF - 4;
    g.appendChild(svg('rect', { x: -hw / 2, y: -hh / 2, width: hw, height: hh, class: 'btn-hit' }));
    g.appendChild(svg('rect', { x: -BTN / 2, y: -BTN / 2 + 4, width: BTN, height: BTN, rx: 15, class: 'btn-shadow' }));
    g.appendChild(svg('rect', { x: -BTN / 2, y: -BTN / 2, width: BTN, height: BTN, rx: 15, class: 'btn-face' }));
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
    btnMap.set(`${axis}:${index}:${dir}`, g);
  }
  // 보드와 버튼 사이 간격을 네 방향 똑같이: 위 버튼은 아래쪽 그림자(4)만큼 더 올리고, 아래 버튼은 오른쪽 버튼과 같은 높이에 둔다
  const edgeNear = BTN / 2;
  const edgeTop = BTN / 2 - 4;
  const edgeFar = T - BTN / 2;
  for (let i = 0; i < n; i++) {
    const mid = OFF + i * C + C / 2;
    // 바깥쪽 이동: 표시 화살표와 실제 이동을 일치시킨다. 공급원 줄 잠금은 그대로다.
    addButton('row', i, -1, edgeNear, mid, W); // 왼쪽 ← : 왼쪽 이동
    addButton('row', i, 1, T - BTN / 2, mid, E); // 오른쪽 → : 오른쪽 이동
    addButton('col', i, -1, mid, edgeTop, N); // 위 ↑ : 위 이동
    addButton('col', i, 1, mid, edgeFar, S); // 아래 ↓ : 아래 이동
  }

  // ----- 배치/흐름 -----
  function layout(cells) {
    for (let pos = 0; pos < cells.length; pos++) {
      tileEls[cells[pos]].setAttribute('transform', `translate(${(pos % n) * C} ${Math.floor(pos / n) * C})`);
    }
  }

  // 햄스터(가운데)에서 도토리 쪽으로 차례로 켠다(햄스터가 도토리를 찾아가는 방향).
  // 이미 켜져 있던 타일은 그대로 두고 새로 켜지는 타일만 순서대로.
  function setFlow(cells, conn, { instant = false } = {}) {
    const reduce = instant || prefersReducedMotion();
    // 켜지는 길은 "햄스터와 도토리가 실제로 이어진 길"뿐이다.
    // 햄스터에서 이어지기만 하고 도토리에 닿지 못한 막다른 길은 켜지 않는다(이어진 것처럼 보이면 안 된다).
    // lit: 칸 번호 → 햄스터에서 몇 칸째인지(햄스터 칸이 0)
    const lit = new Map();
    for (let pos = 0; pos < cells.length; pos++) if (conn.dist[pos] === 0) lit.set(cells[pos], 0);
    for (const g of conn.goals) {
      if (!g.connected) continue;
      for (let p = g.pos; p !== -1; p = conn.parent[p]) lit.set(cells[p], conn.dist[p] < 0 ? 0 : conn.dist[p]);
    }
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
    // 힌트: 누를 화살표를 강조한다. null이면 강조를 지운다.
    showHint(move) {
      for (const g of btnMap.values()) g.classList.remove('hinted');
      if (move) btnMap.get(`${move.axis}:${move.index}:${move.dir}`)?.classList.add('hinted');
    },
    // 벽 보기 힌트: 나무 울타리 모양의 벽을 칸 사이에 세운다. 조각을 밀어도 벽은 제자리에 남는다.
    setWalls(walls) {
      root.querySelector('.walls')?.remove();
      if (!walls || !walls.length) return;
      const g = svg('g', { class: 'walls', transform: `translate(${OFF} ${OFF})`, 'pointer-events': 'none' });
      for (const w of walls) {
        const [x1, y1, x2, y2] = w.dir === 'v'
          ? [(w.c + 1) * C, w.r * C + 14, (w.c + 1) * C, w.r * C + 86]
          : [w.c * C + 14, (w.r + 1) * C, w.c * C + 86, (w.r + 1) * C];
        g.appendChild(svg('line', { x1, y1, x2, y2, class: 'wall-edge' }));
        g.appendChild(svg('line', { x1, y1, x2, y2, class: 'wall-face' }));
      }
      // 판 가장자리: 길은 판 밖으로 이어지지 않으므로 둘레에도 칸마다 벽을 세운다
      const edge = n * C;
      for (let i = 0; i < n; i++) {
        for (const [x1, y1, x2, y2] of [[i * C + 14, 0, i * C + 86, 0], [i * C + 14, edge, i * C + 86, edge], [0, i * C + 14, 0, i * C + 86], [edge, i * C + 14, edge, i * C + 86]]) {
          g.appendChild(svg('line', { x1, y1, x2, y2, class: 'wall-edge' }));
          g.appendChild(svg('line', { x1, y1, x2, y2, class: 'wall-face' }));
        }
      }
      tilesLayer.after(g);
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
