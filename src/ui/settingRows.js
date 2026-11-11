// 설정 스위치 줄(배경음·효과음·버튼음·진동). 설정 화면과 게임 안 설정 창이 함께 쓴다.
import { t } from '../i18n.js';
import { el } from './art.js';
import { sound, setSoundEnabled, setMusicEnabled, setTapEnabled } from './sound.js';

function switchRow(store, label, key, onChange) {
  const tg = el('button', {
    class: `tg${store.data.settings[key] ? '' : ' off'}`, type: 'button', role: 'switch',
    'aria-checked': String(store.data.settings[key]), 'aria-label': label,
    onclick: () => {
      store.data.settings[key] = !store.data.settings[key];
      store.save();
      tg.classList.toggle('off', !store.data.settings[key]);
      tg.setAttribute('aria-checked', String(store.data.settings[key]));
      onChange(store.data.settings[key]);
    },
  });
  return el('div', { class: 'r' }, [label, tg]);
}

export function soundSwitches(store) {
  return [
    switchRow(store, t('배경음'), 'music', (on) => setMusicEnabled(on)),
    switchRow(store, t('효과음'), 'sound', (on) => { setSoundEnabled(on); if (on) sound.fed(); }),
    switchRow(store, t('버튼음'), 'tap', (on) => { setTapEnabled(on); if (on) sound.tap(); }),
    switchRow(store, t('진동'), 'vibrate', (on) => { if (on) navigator.vibrate?.(20); }),
  ];
}
