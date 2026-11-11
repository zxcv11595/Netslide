// 구매 처리: 결제 사업자가 없으면 아무것도 주지 않고, 있으면 결과에 따라 한 번만 준다
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPurchases } from '../src/shop/purchases.js';
import { PRODUCTS, HINT_PACKS, NO_ADS, productById } from '../src/shop/catalog.js';
import { createMockPay } from '../src/shop/mockPay.js';
import { createAdManager } from '../src/breaks/breakManager.js';

const memStore = (hints = 3) => { let saves = 0; return { data: { hints, ads: { playMs: 0, doneIds: [], lastShownAt: 0, impressions: 0 } }, save() { saves++; }, get saves() { return saves; } }; };

test('상품 목록: 힌트 묶음 셋과 광고 제거, 가격은 두 언어 모두 있다', () => {
  assert.deepEqual(HINT_PACKS.map((p) => p.amount), [5, 20, 50]);
  assert.equal(NO_ADS.kind, 'noads');
  for (const p of PRODUCTS) assert.ok(p.price.ko && p.price.en, p.id);
  assert.equal(productById('nope'), null);
});

test('결제 사업자가 없으면 구매·복원 모두 이루어지지 않는다', async () => {
  const s = memStore();
  const shop = createPurchases({ store: s });
  assert.equal(shop.available, false);
  assert.deepEqual(await shop.buy(HINT_PACKS[1]), { status: 'unavailable' });
  assert.deepEqual(await shop.buy(NO_ADS), { status: 'unavailable' });
  assert.deepEqual(await shop.restore(), { status: 'unavailable', restored: 0 });
  assert.equal(s.data.hints, 3);
  assert.equal(s.saves, 0);
  assert.equal(shop.owns('noads'), false);
  assert.equal(shop.priceOf(HINT_PACKS[0]), '₩1,200');
  assert.equal(createPurchases({ store: s, lang: 'en' }).priceOf(HINT_PACKS[0]), '$0.99');
});

test('결제 성공: 힌트가 늘고 저장한다. 취소·실패는 아무것도 주지 않는다', async () => {
  const s = memStore();
  let changes = 0;
  const shop = createPurchases({ store: s, provider: createMockPay('ok', 0) });
  shop.onChange(() => { changes++; });
  assert.deepEqual(await shop.buy(HINT_PACKS[1]), { status: 'ok' });
  assert.equal(s.data.hints, 23);
  assert.equal(s.saves, 1);
  assert.equal(changes, 1);
  for (const mode of ['cancel', 'fail']) {
    const s2 = memStore();
    const shop2 = createPurchases({ store: s2, provider: createMockPay(mode, 0) });
    assert.deepEqual(await shop2.buy(HINT_PACKS[0]), { status: mode === 'cancel' ? 'cancelled' : 'failed' });
    assert.equal(s2.data.hints, 3);
  }
  const thrower = createPurchases({ store: memStore(), provider: { purchase: async () => { throw new Error('x'); } } });
  assert.deepEqual(await thrower.buy(HINT_PACKS[0]), { status: 'failed' });
});

test('힌트는 999개를 넘지 않고, 결제 중에는 다른 구매를 받지 않는다', async () => {
  const s = memStore(990);
  const shop = createPurchases({ store: s, provider: createMockPay('ok', 5) });
  const first = shop.buy(HINT_PACKS[2]);
  assert.deepEqual(await shop.buy(HINT_PACKS[0]), { status: 'busy' });
  assert.deepEqual(await first, { status: 'ok' });
  assert.equal(s.data.hints, 999);
});

test('광고 제거: 한 번만 살 수 있고 저장 자료에는 남기지 않으며 복원으로 되찾는다', async () => {
  const s = memStore();
  const pay = createMockPay('ok', 0);
  const shop = createPurchases({ store: s, provider: pay });
  assert.deepEqual(await shop.buy(NO_ADS), { status: 'ok' });
  assert.equal(shop.owns('noads'), true);
  assert.deepEqual(await shop.buy(NO_ADS), { status: 'owned' });
  assert.equal(JSON.stringify(s.data).includes('noads'), false);
  // 다시 켠 것처럼 새로 만들면 복원 전에는 없다
  const again = createPurchases({ store: s, provider: pay });
  assert.equal(again.owns('noads'), false);
  assert.deepEqual(await again.restore(), { status: 'ok', restored: 1 });
  assert.equal(again.owns('noads'), true);
  assert.deepEqual(await again.restore(), { status: 'ok', restored: 0 });
});

test('광고 제거를 샀으면 판 사이 광고 기회를 만들지 않는다', async () => {
  const cfg = { enabled: true, minDistinctStages: 0, minPlayMs: 0, requestTimeoutMs: 100, retryCooldownMs: 0 };
  let shown = 0;
  const provider = { isReady: () => true, show({ onStart, onFinish }) { shown++; onStart(); onFinish('shown'); } };
  let noAds = false;
  const ads = createAdManager({ config: cfg, provider, store: memStore(), noAds: () => noAds });
  assert.equal((await ads.showBetweenStages()).outcome, 'shown');
  assert.equal(shown, 1);
  noAds = true;
  assert.equal(ads.isEnabled(), false);
  assert.deepEqual(await ads.showBetweenStages(), { outcome: 'disabled' });
  assert.equal(shown, 1, '광고 제거 뒤에는 더 보여 주지 않는다');
});
