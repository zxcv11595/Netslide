// 버전이 있는 localStorage 저장. 손상·저장 실패·구버전 데이터로 게임이 멈추지 않게 한다.
// 구매 권한 같은 값은 여기에 두지 않는다.
export const SAVE_VERSION = 1;

function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
const posInt = (x) => (Number.isInteger(x) && x >= 0 ? x : null);

export function emptyContent() {
  return { records: {}, current: null, daily: {} };
}

export function emptyData() {
  return {
    v: SAVE_VERSION,
    content: {}, // 콘텐츠 버전별 기록. 버전이 다른 판 기록은 섞지 않는다.
    ads: { playMs: 0, doneIds: [], lastShownAt: 0, impressions: 0 },
  };
}

// 모양이 어긋난 필드는 버리고 쓸 수 있는 값만 남긴다.
export function sanitize(raw) {
  const data = emptyData();
  if (!isObj(raw)) return data;
  if (isObj(raw.content)) {
    for (const [ver, c] of Object.entries(raw.content)) {
      if (!isObj(c)) continue;
      const out = emptyContent();
      if (isObj(c.records)) {
        for (const [id, r] of Object.entries(c.records)) {
          if (!isObj(r) || !r.done) continue;
          out.records[id] = {
            done: true,
            stars: Math.min(3, posInt(r.stars) ?? 0),
            best: posInt(r.best),
            bestBonus: posInt(r.bestBonus),
          };
        }
      }
      if (isObj(c.current) && typeof c.current.stageId === 'string' && Array.isArray(c.current.history)
        && c.current.history.every((h) => typeof h === 'string')) {
        out.current = {
          stageId: c.current.stageId,
          date: typeof c.current.date === 'string' ? c.current.date : null,
          history: c.current.history.slice(),
        };
      }
      if (isObj(c.daily)) {
        for (const [date, d] of Object.entries(c.daily)) {
          if (!isObj(d) || typeof d.id !== 'string') continue;
          out.daily[date] = {
            id: d.id, stars: Math.min(3, posInt(d.stars) ?? 0), moves: posInt(d.moves), bonus: !!d.bonus,
          };
        }
      }
      data.content[ver] = out;
    }
  }
  if (isObj(raw.ads)) {
    data.ads.playMs = posInt(Math.floor(Number(raw.ads.playMs))) ?? 0;
    data.ads.doneIds = Array.isArray(raw.ads.doneIds) ? raw.ads.doneIds.filter((x) => typeof x === 'string') : [];
    data.ads.lastShownAt = posInt(raw.ads.lastShownAt) ?? 0;
    data.ads.impressions = posInt(raw.ads.impressions) ?? 0;
  }
  return data;
}

function defaultBackend() {
  try {
    const ls = globalThis.localStorage;
    const probe = '__probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

// 반환: { data, content(ver), save(), persistent, issue }
//   persistent=false 이면 메모리로만 플레이 중이다.
//   issue: null | 'unavailable' | 'corrupt' | 'newer' | 'write-failed'
export function createStore({ key, backend = defaultBackend() } = {}) {
  const store = {
    data: emptyData(),
    persistent: !!backend,
    issue: backend ? null : 'unavailable',
    content(ver) {
      const k = String(ver);
      if (!store.data.content[k]) store.data.content[k] = emptyContent();
      return store.data.content[k];
    },
    save() {
      if (!store.persistent) return false;
      try {
        backend.setItem(key, JSON.stringify(store.data));
        return true;
      } catch {
        store.persistent = false;
        store.issue = 'write-failed';
        return false;
      }
    },
  };
  if (!backend) return store;

  let text = null;
  try { text = backend.getItem(key); } catch { store.persistent = false; store.issue = 'unavailable'; return store; }
  if (text == null) return store;

  let raw;
  try { raw = JSON.parse(text); } catch { raw = undefined; }
  if (!isObj(raw)) {
    // 손상된 원문은 따로 보관하고 새로 시작한다
    try { backend.setItem(`${key}.corrupt`, text); } catch { /* 보관 실패는 무시 */ }
    store.issue = 'corrupt';
    return store;
  }
  if (Number.isInteger(raw.v) && raw.v > SAVE_VERSION) {
    // 더 새로운 형식의 저장: 덮어쓰지 않도록 보관 후 새로 시작
    try { backend.setItem(`${key}.v${raw.v}`, text); } catch { /* 무시 */ }
    store.issue = 'newer';
    return store;
  }
  // v가 없거나 낮은 구버전은 현재 모양으로 정리해서 읽는다(현재 v1이 최초 버전).
  store.data = sanitize(raw);
  return store;
}
