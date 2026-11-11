// 상점 화면과 구매 창(확인 → 결제 중 → 결과). 실제 결제는 src/shop/purchases.js의 provider가 맡는다.
// provider가 없는 지금은 구매 과정만 보여 주고 "아직 구매할 수 없어요"로 끝난다(결제되지 않는다).
import { t } from '../i18n.js';
import { HINT_PACKS, NO_ADS } from '../shop/catalog.js';
import { el } from './art.js';
import { icon, tabbar, headRow } from './common.js';
import { toast } from './toast.js';
import { sound } from './sound.js';
import { track } from '../analytics.js';

export function productName(p) {
  return p.kind === 'hints' ? t('힌트 {n}개', { n: p.amount }) : t('광고 제거');
}
function productDesc(p) {
  if (p.kind === 'noads') return t('판 사이 광고와 아래 광고 띠가 사라져요.');
  if (p.tag === 'popular') return t('가장 많이 골라요');
  if (p.tag === 'best') return t('가장 알뜰해요');
  return t('조금만 필요할 때');
}
const productPic = (p) => el('div', { class: `prod-pic ${p.kind}` }, [
  icon(p.kind === 'hints' ? 'bulb' : 'noad', p.kind === 'hints' ? 'bulb' : ''),
  p.kind === 'hints' ? el('i', { text: `×${p.amount}` }) : null,
]);

// 구매 창. 닫힐 때 onDone(구매했으면 true)을 한 번 부른다.
export function openBuyDialog(ctx, product, onDone = () => {}) {
  const { purchases, store } = ctx;
  const name = productName(product);
  const price = purchases.priceOf(product);
  let busy = false;
  let bought = false;
  const card = el('div', { class: 'modal-card buy-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('구매 확인') });
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay && !busy) close(); } }, [card]);
  function close() {
    overlay.remove();
    onDone(bought);
  }
  function show(children) {
    card.replaceChildren(...children.filter(Boolean));
    card.querySelector('button')?.focus({ preventScroll: true });
  }
  const btn = (cls, label, onclick) => el('button', { class: cls, type: 'button', text: label, onclick });
  const okOnly = () => btn('go buy-ok', t('확인'), close);

  // 1) 살지 묻는다
  function confirm() {
    show([
      productPic(product),
      el('h2', { text: name }),
      el('p', { class: 'sheet-text', text: t('{price}에 구매할까요?', { price }) }),
      el('p', { class: 'sheet-sub', text: t('결제는 스토어 결제 창에서 진행돼요.') }),
      el('div', { class: 'buy-actions' }, [btn('btn', t('취소'), close), btn('go', t('구매하기'), pay)]),
    ]);
  }

  // 2) 결제를 기다린다(이 동안에는 닫을 수 없다)
  async function pay() {
    if (busy) return;
    if (purchases.available) {
      busy = true;
      show([
        productPic(product),
        el('h2', { text: t('결제 중이에요') }),
        el('p', { class: 'sheet-sub', text: t('잠시만 기다려 주세요.') }),
        el('div', { class: 'seeking-dots buy-dots', 'aria-hidden': 'true' }, [el('b'), el('b'), el('b')]),
      ]);
    }
    const { status } = await purchases.buy(product);
    busy = false;
    track('shop_result', { product: product.id, status });
    if (!overlay.isConnected) return;
    result(status);
  }

  // 3) 결과
  function result(status) {
    if (status === 'cancelled') { close(); toast(t('구매를 취소했어요')); return; }
    if (status === 'ok') {
      bought = true;
      sound.win?.();
      show([
        productPic(product),
        el('h2', { text: t('구매 완료') }),
        product.kind === 'hints'
          ? el('p', { class: 'sheet-text' }, [t('힌트 {n}개를 받았어요.', { n: product.amount }), el('br'), t('내 힌트'), ' ', el('b', { text: t('{n}개', { n: store.data.hints }) })])
          : el('p', { class: 'sheet-text', text: t('이제 광고가 나오지 않아요.') }),
        okOnly(),
      ]);
      return;
    }
    if (status === 'owned') {
      show([productPic(product), el('h2', { text: t('이미 구매했어요') }), el('p', { class: 'sheet-sub', text: t('결제되지 않았어요.') }), okOnly()]);
      return;
    }
    if (status === 'unavailable') {
      show([
        productPic(product),
        el('h2', { text: t('아직 구매할 수 없어요') }),
        el('p', { class: 'sheet-text', text: t('결제는 앱 출시 때 열려요.') }),
        el('p', { class: 'sheet-sub', text: t('결제되지 않았어요.') }),
        okOnly(),
      ]);
      return;
    }
    show([
      productPic(product),
      el('h2', { text: t('결제하지 못했어요') }),
      el('p', { class: 'sheet-text', text: t('잠시 뒤 다시 해 주세요.') }),
      el('p', { class: 'sheet-sub', text: t('결제되지 않았어요.') }),
      el('div', { class: 'buy-actions' }, [btn('btn', t('닫기'), close), btn('go', t('다시 시도'), pay)]),
    ]);
  }

  sound.open?.();
  document.body.appendChild(overlay);
  confirm();
}

// 힌트 묶음을 고르는 창(게임 화면의 힌트 창에서 연다). 고르면 구매 창으로 넘어간다.
export function openHintPacks(ctx, onDone = () => {}) {
  const close = () => overlay.remove();
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) { close(); onDone(false); } } }, [
    el('div', { class: 'modal-card buy-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('힌트 묶음 구매') }, [
      el('h2', { text: t('힌트 묶음 구매') }),
      ...HINT_PACKS.map((p) => el('button', {
        class: `${p.tag === 'popular' ? 'go' : 'btn'} pack-choice`, type: 'button',
        onclick: () => { close(); openBuyDialog(ctx, p, onDone); },
      }, [icon('bulb', 'bulb'), el('span', { text: productName(p) }), el('em', { text: ctx.purchases.priceOf(p) })])),
      el('button', { class: 'link-btn', type: 'button', text: t('닫기'), onclick: () => { close(); onDone(false); } }),
    ]),
  ]);
  sound.open?.();
  document.body.appendChild(overlay);
}

// ----- 상점 화면 -----
export function createShopScreen(ctx) {
  const { store, purchases } = ctx;
  const body = el('div', { class: 'shop-body intro' }); // intro: 처음 들어올 때만 상품 줄이 차례로 올라온다
  // 머리줄 오른쪽 위: 전구와 남은 힌트 수만 작게 보여 준다
  const walletNum = el('b');
  const wallet = el('div', { class: 'head-hints', role: 'img' }, [icon('bulb', 'bulb'), walletNum]);
  let restoring = false;

  const priceBtn = (p) => el('button', {
    class: 'go price', type: 'button', 'aria-label': t('{name} 구매, {price}', { name: productName(p), price: purchases.priceOf(p) }),
    text: purchases.priceOf(p), onclick: () => openBuyDialog(ctx, p, render),
  });
  const row = (p, right) => el('div', { class: 'card prod' }, [
    productPic(p),
    el('div', { class: 'prod-txt' }, [el('b', { text: productName(p) }), el('small', { text: productDesc(p) })]),
    right,
  ]);

  async function restore() {
    if (restoring) return;
    restoring = true;
    render();
    const res = await purchases.restore();
    restoring = false;
    if (!body.isConnected) return;
    render();
    if (res.status === 'unavailable') toast(t('구매 복원은 앱 출시 때 열려요'));
    else if (res.status === 'failed') toast(t('구매를 복원하지 못했어요. 잠시 뒤 다시 해 주세요.'), 3200);
    else toast(res.restored ? t('구매를 복원했어요') : t('복원할 구매가 없어요'));
  }

  function render() {
    walletNum.textContent = String(store.data.hints);
    wallet.setAttribute('aria-label', t('내 힌트 {n}개', { n: store.data.hints }));
    body.replaceChildren(...[
      purchases.available ? null : el('p', { class: 'notice center', text: t('결제는 앱 출시 때 열려요. 지금은 구매되지 않아요.') }),
      el('div', { class: 'head', text: t('힌트@shop') }),
      ...HINT_PACKS.map((p) => row(p, priceBtn(p))),
      el('div', { class: 'ghost prod' }, [
        el('div', { class: 'prod-pic' }, [icon('play')]),
        el('div', { class: 'prod-txt' }, [el('b', { text: t('광고 보고 힌트 받기') })]),
        el('span', { class: 'soon', text: t('준비 중') }),
      ]),
      el('div', { class: 'head', text: t('광고 제거') }),
      row(NO_ADS, purchases.owns(NO_ADS.id) ? el('span', { class: 'owned', text: t('구매함') }) : priceBtn(NO_ADS)),
      el('button', { class: 'link-btn shop-restore', type: 'button', disabled: restoring, text: restoring ? t('확인하는 중…') : t('구매 복원'), onclick: restore }),
    ].filter(Boolean));
  }
  render();
  setTimeout(() => body.classList.remove('intro'), 600); // 구매 창을 닫고 다시 그릴 때는 깜빡이지 않게

  const pad = el('div', { class: 'pad' }, [headRow(t('상점'), null, wallet), el('div', { class: 'hr' }), body]);
  const root = el('section', { class: 'screen' }, [pad, tabbar(ctx, 'shop')]);
  return { el: root, destroy() { root.remove(); } };
}
