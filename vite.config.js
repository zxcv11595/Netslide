import { defineConfig } from 'vite';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// 빌드가 끝나면 오프라인용 파일 목록(precache.json)을 만들고, 서비스 워커에 빌드 시각을 적어 배포마다 새로 설치되게 한다.
function offlineFiles() {
  return {
    name: 'offline-files',
    apply: 'build',
    closeBundle() {
      const walk = (dir, base = '') => readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        const rel = base ? `${base}/${name}` : name;
        return statSync(full).isDirectory() ? walk(full, rel) : [rel];
      });
      const skip = new Set(['sw.js', 'precache.json', 'index.html', 'privacy.html', '.nojekyll']);
      const files = walk('dist').filter((f) => !skip.has(f) && !f.endsWith('.txt') && !f.endsWith('og.jpg'));
      writeFileSync('dist/precache.json', JSON.stringify(files));
      const sw = readFileSync('dist/sw.js', 'utf8');
      writeFileSync('dist/sw.js', sw.split('__BUILD__').join(String(Date.now()))); // 주석에 적힌 것까지 모두 바꾼다
      const kb = Math.round(files.reduce((n, f) => n + statSync(join('dist', f)).size, 0) / 1024);
      console.log(`\n오프라인용 파일 ${files.length}개(${kb}KB)를 목록에 담았습니다.${sw.includes('__BUILD__') ? '' : ' (경고: sw.js에 __BUILD__ 표시가 없습니다)'}`);
    },
  };
}

// base를 상대 경로로 두어 정적 호스팅의 하위 경로(/games/hamster/ 등)에서도 동작하게 한다.
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  plugins: [offlineFiles()],
});
