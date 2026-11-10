// 오늘의 도전: 한국 시간(Asia/Seoul, UTC+9, 서머타임 없음) 날짜 ↔ 검증된 일일 판 목록
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function kstDateString(nowMs = Date.now()) {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function isValidDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

function dayNumber(dateStr) {
  return Math.round(Date.parse(`${dateStr}T00:00:00Z`) / DAY_MS);
}

// 같은 날짜에는 모두 같은 판. 목록 길이를 주기로 순환한다.
export function dailyStageFor(content, dateStr) {
  const n = content.daily.length;
  if (!n || !isValidDateString(dateStr)) return null;
  const diff = dayNumber(dateStr) - dayNumber(content.dailyEpoch);
  return content.daily[((diff % n) + n) % n];
}
