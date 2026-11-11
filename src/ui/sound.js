// 소리: 효과음과 배경음. 소리 파일 없이 Web Audio로 음을 만든다(용량 0, 지연 없음).
// 브라우저는 사용자가 화면을 누르기 전에는 소리를 막으므로, 처음 누른 뒤에 만들어진다.
let ctx = null;
let sfxOn = true; // 효과음(줄 밀기, 배달, 별 등 게임 소리)
let tapOn = true; // 버튼음(탭, 목록, 창의 버튼)
let musicOn = true;
let sfxOut = null; // 효과음 크기 조절
let musicOut = null; // 배경음 크기 조절

// 전체 크기(2026-11-11에 두 배로 올렸다: 효과음 1 → 2, 배경음 0.055 → 0.11)
const SFX_VOLUME = 2;
const MUSIC_VOLUME = 0.11;

function audio() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try {
    if (!ctx) {
      ctx = new AC();
      sfxOut = ctx.createGain();
      sfxOut.gain.value = SFX_VOLUME;
      sfxOut.connect(ctx.destination);
      musicOut = ctx.createGain();
      musicOut.gain.value = 0;
      musicOut.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// 음 하나: 주파수(끝 주파수로 미끄러질 수 있음), 길이, 크기, 파형, 시작 시각
function tone(ac, out, { f, f2 = f, t = 0.09, vol = 0.12, type = 'sine', at = 0, when = null }) {
  const t0 = (when ?? ac.currentTime) + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t0);
  if (f2 !== f) osc.frequency.exponentialRampToValueAtTime(f2, t0 + t);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + t + 0.03);
}

const emit = (notes) => { const ac = audio(); if (ac) for (const n of notes) tone(ac, sfxOut, n); };
const play = (notes) => { if (sfxOn) emit(notes); };
const playTap = (notes) => { if (tapOn) emit(notes); };

// ---------- 효과음 ----------
// 통통 튀는 "뽀옹/뾰롱" 느낌: 높은 사인파에 음높이가 빠르게 올라가거나 내려가는 짧은 소리.
export const sound = {
  // 화면의 보통 버튼(탭, 목록, 창의 버튼): 작은 "뽁"
  tap: () => playTap([{ f: 640, f2: 960, t: 0.055, vol: 0.08 }]),
  // 창이 열릴 때: 통통 두 번 올라가는 음
  open: () => playTap([{ f: 520, f2: 700, t: 0.06, vol: 0.07 }, { f: 700, f2: 940, t: 0.08, vol: 0.07, at: 0.06 }]),
  // 줄을 밀 때: 말랑한 "뽀옹"
  slide: () => play([{ f: 330, f2: 560, t: 0.1, vol: 0.13 }]),
  // 잠긴 줄을 눌렀을 때: 귀여운 "뿌뿌"
  locked: () => play([{ f: 240, f2: 200, t: 0.06, vol: 0.09, type: 'triangle' }, { f: 240, f2: 190, t: 0.07, vol: 0.09, type: 'triangle', at: 0.08 }]),
  // 길이 새 햄스터에게 닿았을 때: 반짝이는 두 음
  fed: () => play([{ f: 988, t: 0.09, vol: 0.1 }, { f: 1319, t: 0.16, vol: 0.1, at: 0.08 }, { f: 1976, t: 0.1, vol: 0.04, at: 0.12 }]),
  // 클리어: 통통 튀는 도-미-솔-도-미 + 반짝임
  win: () => play([523, 659, 784, 1047, 1319].map((f, i) => ({ f, f2: f * 1.02, t: i === 4 ? 0.4 : 0.13, vol: 0.12, at: i * 0.1 }))
    .concat([{ f: 2093, t: 0.25, vol: 0.04, at: 0.46 }, { f: 2637, t: 0.25, vol: 0.03, at: 0.52 }])),
  // 결과 창에서 별이 하나씩 켜질 때: 별마다 한 음씩 높은 "띠링"
  star: (i = 0) => { const f = [880, 1109, 1319][Math.min(i, 2)]; play([{ f, t: 0.18, vol: 0.1 }, { f: f * 2, t: 0.12, vol: 0.035, at: 0.02 }]); },
  // 힌트가 화살표를 알려 줄 때: 작은 종소리 "띠링"
  hint: () => play([{ f: 1175, t: 0.14, vol: 0.08 }, { f: 1568, t: 0.2, vol: 0.08, at: 0.07 }]),
  // 안내와 다른 줄을 밀었을 때: 부드러운 "어라?"
  wrong: () => play([{ f: 440, f2: 400, t: 0.09, vol: 0.09 }, { f: 349, f2: 310, t: 0.13, vol: 0.09, at: 0.09 }]),
  // 되돌리기·재시작: 거꾸로 감기는 "뾰로롱"
  back: () => play([{ f: 780, f2: 420, t: 0.1, vol: 0.1 }]),
};

export function setSoundEnabled(on) { sfxOn = !!on; }
export function setTapEnabled(on) { tapOn = !!on; }

// ---------- 배경음 ----------
// 오르골 느낌의 통통 튀는 반복 선율. 도·레·미·솔·라(펜타토닉)만 써서 어떻게 이어도 어울린다.
const BEAT = 0.34; // 한 음 길이(초)
const BARS = [
  [262, 330, 392, 330, 440, 392, 330, 294],
  [262, 294, 330, 392, 330, 294, 262, 294],
  [330, 392, 440, 392, 330, 294, 330, 392],
  [294, 330, 392, 330, 294, 262, 294, 262],
];
let step = 0;
let nextAt = 0;
let timer = null;

function schedule() {
  const ac = audio();
  if (!ac || !musicOn) return;
  // 0.6초 앞까지 미리 예약해 둔다(탭이 잠깐 바빠도 끊기지 않게)
  while (nextAt < ac.currentTime + 0.6) {
    const bar = BARS[Math.floor(step / 8) % BARS.length];
    const f = bar[step % 8];
    tone(ac, musicOut, { f: f * 2, t: BEAT * 1.3, vol: 0.5, type: 'sine', when: nextAt });
    if (step % 4 === 0) tone(ac, musicOut, { f: bar[0], t: BEAT * 1.2, vol: 0.4, type: 'sine', when: nextAt }); // 두 박마다 통통 튀는 낮은 음
    nextAt += BEAT;
    step++;
  }
}

function startMusic() {
  const ac = audio();
  if (!ac || timer || !musicOn || globalThis.document?.hidden) return;
  nextAt = ac.currentTime + 0.08;
  musicOut.gain.cancelScheduledValues(ac.currentTime);
  musicOut.gain.setTargetAtTime(MUSIC_VOLUME, ac.currentTime, 0.6); // 조용히 깔리는 크기로 서서히
  schedule();
  timer = setInterval(schedule, 200);
}

function stopMusic() {
  if (timer) { clearInterval(timer); timer = null; }
  if (ctx && musicOut) musicOut.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
}

export function setMusicEnabled(on) {
  musicOn = !!on;
  if (musicOn) startMusic(); else stopMusic();
}

// 처음 화면을 누른 뒤에 배경음을 시작하고, 화면을 떠나 있으면 멈춘다.
export function initSound({ sound: sfx = true, music = true, tap = true } = {}) {
  sfxOn = !!sfx;
  tapOn = !!tap;
  musicOn = !!music;
  const doc = globalThis.document;
  if (!doc) return;
  const first = () => { doc.removeEventListener('pointerdown', first, true); startMusic(); };
  doc.addEventListener('pointerdown', first, true);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) stopMusic(); else startMusic(); });
}
