// 처음 하는 사람을 위한 안내: 화면을 어둡게 하고 한 곳만 밝혀서 설명과 함께 보여 준다.
// 밝힌 곳만 누를 수 있다. 어두운 곳을 눌러도 아래 화면은 반응하지 않는다.
import { el } from './art.js';

const NS = 'http://www.w3.org/2000/svg';

// 반환: { show(step), hide(), destroy(), active }
//   step = { rect(): DOMRect 같은 것, title, text, button: '다음' | null, onNext, pad, round }
export function createCoach() {
  // 누름을 막는 투명한 네 조각(밝힌 곳만 비워 둔다)
  const blocks = ['t', 'b', 'l', 'r'].map(() => el('div', { class: 'coach-block' }));
  // 어두운 막: 화면 전체를 덮는 그림 한 장에서 밝힐 곳만 둥글게 파낸다(구멍 밖은 빈틈없이 어둡다)
  const shade = document.createElementNS(NS, 'svg');
  shade.setAttribute('class', 'coach-shade');
  shade.setAttribute('aria-hidden', 'true');
  const shadePath = document.createElementNS(NS, 'path');
  shadePath.setAttribute('fill-rule', 'evenodd');
  shade.appendChild(shadePath);
  const ring = el('div', { class: 'coach-ring', 'aria-hidden': 'true' });
  const titleEl = el('b');
  const textEl = el('span');
  const btn = el('button', { class: 'coach-next', type: 'button' });
  const card = el('div', { class: 'coach-card', role: 'dialog', 'aria-live': 'polite' }, [titleEl, textEl, btn]);
  const root = el('div', { class: 'coach', hidden: true }, [shade, ...blocks, ring, card]);
  // 화면 요소 안이 아니라 문서 맨 위에 붙인다(어떤 화면 크기에서도 창 전체를 덮도록)
  document.body.appendChild(root);
  let step = null;

  function place() {
    if (!step) return;
    const r = step.rect();
    if (!r) return;
    const W = document.documentElement.clientWidth;
    const H = innerHeight;
    const pad = step.pad ?? 4;
    const x = Math.max(0, r.left - pad);
    const y = Math.max(0, r.top - pad);
    const w = Math.min(W - x, r.width + pad * 2);
    const h = Math.min(H - y, r.height + pad * 2);
    const rad = Math.min(step.round ?? 16, w / 2, h / 2);
    const set = (node, s) => Object.assign(node.style, s);
    set(blocks[0], { left: '0', top: '0', width: `${W}px`, height: `${y}px` });
    set(blocks[1], { left: '0', top: `${y + h}px`, width: `${W}px`, height: `${Math.max(0, H - y - h)}px` });
    set(blocks[2], { left: '0', top: `${y}px`, width: `${x}px`, height: `${h}px` });
    set(blocks[3], { left: `${x + w}px`, top: `${y}px`, width: `${Math.max(0, W - x - w)}px`, height: `${h}px` });
    shade.setAttribute('viewBox', `0 0 ${W} ${H}`);
    shade.setAttribute('width', W);
    shade.setAttribute('height', H);
    shadePath.setAttribute('d', `M0 0H${W}V${H}H0Z`
      + `M${x + rad} ${y}h${w - rad * 2}a${rad} ${rad} 0 0 1 ${rad} ${rad}v${h - rad * 2}a${rad} ${rad} 0 0 1 ${-rad} ${rad}h${-(w - rad * 2)}a${rad} ${rad} 0 0 1 ${-rad} ${-rad}v${-(h - rad * 2)}a${rad} ${rad} 0 0 1 ${rad} ${-rad}Z`);
    set(ring, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, borderRadius: `${rad}px` });
    // 설명 카드는 밝힌 곳 아래에 자리가 있으면 아래에(판을 가리지 않게), 없으면 위에 둔다
    const below = H - (y + h) >= card.offsetHeight + 34;
    card.classList.toggle('above', !below);
    set(card, below ? { top: `${y + h + 18}px`, bottom: 'auto' } : { top: 'auto', bottom: `${H - y + 18}px` });
    // 카드는 밝힌 곳의 가로 가운데에 맞추되 화면 밖으로 나가지 않게 하고, 꼬리는 밝힌 곳의 가운데를 가리킨다
    const half = card.offsetWidth / 2;
    const cx = x + w / 2;
    const left = Math.min(W - half - 10, Math.max(half + 10, cx));
    set(card, { left: `${left}px` });
    card.style.setProperty('--tail', `${Math.min(card.offsetWidth - 26, Math.max(26, cx - (left - half)))}px`);
  }

  const onResize = () => place();
  blocks.forEach((d) => d.addEventListener('click', () => { if (step && !step.button && step.onNext) step.onNext(); }));
  btn.addEventListener('click', () => { if (step && step.onNext) step.onNext(); });

  return {
    show(next) {
      step = next;
      titleEl.textContent = next.title || '';
      titleEl.hidden = !next.title;
      textEl.textContent = next.text || '';
      textEl.hidden = !next.text;
      btn.textContent = next.button || '';
      btn.hidden = !next.button;
      root.hidden = false;
      place();
      addEventListener('resize', onResize);
    },
    hide() { step = null; root.hidden = true; removeEventListener('resize', onResize); },
    get active() { return !!step; },
    destroy() { step = null; removeEventListener('resize', onResize); root.remove(); },
  };
}
