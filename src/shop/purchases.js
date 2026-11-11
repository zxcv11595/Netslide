// 구매 처리. 결제 사업자(구글 플레이 결제 등)가 정해지지 않았으므로 provider가 없으면
// 어떤 구매도 이루어지지 않고 항상 'unavailable'로 끝난다. 화면(상점·구매 창)은 이 결과만 보고 움직인다.
//
// provider 인터페이스(사업자 SDK를 감싸서 구현):
//   purchase(id): Promise<'ok' | 'cancelled' | 'failed'>  — 결제 창을 띄우고 결과를 알려 준다
//   restore(): Promise<string[]>                          — 이 계정이 가진 '계속 남는 상품'의 id 목록
//   priceOf(id): string | null                            — 스토어가 알려 준 현지 가격(없으면 null)
//
// 힌트처럼 쓰면 없어지는 상품은 받는 즉시 저장 자료(store.data.hints)에 더한다.
// 광고 제거처럼 계속 남는 권한은 저장 자료에 두지 않는다(조작 방지). 시작할 때 restore()로 다시 확인한다.
import { PRODUCTS } from './catalog.js';

const MAX_HINTS = 999;

export function createPurchases({ store, provider = null, lang = 'ko' }) {
  const owned = new Set();
  const listeners = new Set();
  let busy = false;
  const changed = () => { for (const f of listeners) f(); };

  function grant(product) {
    if (product.kind === 'hints') {
      store.data.hints = Math.min(MAX_HINTS, store.data.hints + product.amount);
      store.save();
    } else {
      owned.add(product.id);
    }
    changed();
  }

  return {
    get available() { return !!provider; },
    get busy() { return busy; },
    owns: (id) => owned.has(id),
    priceOf(product) {
      return (provider && provider.priceOf && provider.priceOf(product.id)) || product.price[lang] || product.price.ko;
    },
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },

    // 반환: { status: 'ok' | 'cancelled' | 'failed' | 'unavailable' | 'owned' | 'busy' }
    async buy(product) {
      if (product.kind !== 'hints' && owned.has(product.id)) return { status: 'owned' };
      if (!provider) return { status: 'unavailable' };
      if (busy) return { status: 'busy' };
      busy = true;
      let status = 'failed';
      try {
        const res = await provider.purchase(product.id);
        status = res === 'ok' || res === 'cancelled' ? res : 'failed';
      } catch { status = 'failed'; }
      busy = false;
      if (status === 'ok') grant(product);
      return { status };
    },

    // 반환: { status: 'ok' | 'failed' | 'unavailable', restored: 새로 되찾은 상품 수 }
    async restore() {
      if (!provider) return { status: 'unavailable', restored: 0 };
      try {
        const ids = await provider.restore();
        let restored = 0;
        for (const p of PRODUCTS) {
          if (p.kind !== 'hints' && ids.includes(p.id) && !owned.has(p.id)) { owned.add(p.id); restored++; }
        }
        if (restored) changed();
        return { status: 'ok', restored };
      } catch {
        return { status: 'failed', restored: 0 };
      }
    },
  };
}
