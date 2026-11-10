import { defineConfig } from 'vite';

// base를 상대 경로로 두어 정적 호스팅의 하위 경로(/games/hamster/ 등)에서도 동작하게 한다.
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
});
