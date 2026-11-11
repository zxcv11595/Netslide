// 상점 상품. 이름·설명 같은 화면 문구는 src/ui/shop.js에 있다.
// price는 결제 사업자가 실제 가격을 알려 주기 전까지 보여 주는 임시 값이다(출시 전에 스토어 가격과 맞춘다).
//   kind 'hints'  : 쓰면 없어지는 상품. 사면 힌트가 amount개 늘어난다.
//   kind 'noads'  : 한 번 사면 계속 남는 상품. 판 사이 광고와 아래 광고 띠가 사라진다.
export const PRODUCTS = [
  { id: 'hints5', kind: 'hints', amount: 5, price: { ko: '₩1,200', en: '$0.99' } },
  { id: 'hints20', kind: 'hints', amount: 20, price: { ko: '₩3,900', en: '$2.99' }, tag: 'popular' },
  { id: 'hints50', kind: 'hints', amount: 50, price: { ko: '₩7,900', en: '$5.99' }, tag: 'best' },
  { id: 'noads', kind: 'noads', price: { ko: '₩3,300', en: '$2.99' } },
];

export const productById = (id) => PRODUCTS.find((p) => p.id === id) || null;
export const HINT_PACKS = PRODUCTS.filter((p) => p.kind === 'hints');
export const NO_ADS = productById('noads');
