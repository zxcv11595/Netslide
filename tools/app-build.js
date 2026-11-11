// 안드로이드 앱 파일(시험용 APK)을 만든다: npm run app:build
// 게임을 빌드해 앱에 넣고(cap sync), Gradle로 APK를 만든 뒤 output/app/Nutslide-debug.apk 로 복사한다.
// 자바는 17~21이 필요하다(Android Studio에 들어 있는 25는 이 프로젝트의 Gradle 8.11이 지원하지 않는다).
// JAVA_HOME이 맞지 않으면 C:\Users\<사용자>\.jdks 아래의 jdk-21* 을 찾아 쓴다.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

function findJdk() {
  const dir = join(homedir(), '.jdks');
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).filter((n) => /^jdk-(17|21)/.test(n)).sort().pop();
  return hit ? join(dir, hit) : null;
}
const jdk = findJdk();
if (!jdk) { console.error('자바 17~21을 찾지 못했습니다(~/.jdks/jdk-21*).'); process.exit(1); }
const sdk = process.env.ANDROID_HOME || join(homedir(), 'AppData', 'Local', 'Android', 'Sdk');
const env = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk };
const run = (cmd, cwd = '.') => execSync(cmd, { cwd, env, stdio: 'inherit' });

run('npx vite build');
run('npx cap sync android');
run(process.platform === 'win32' ? 'gradlew.bat assembleDebug --console=plain -q' : './gradlew assembleDebug --console=plain -q', 'android');

const apk = join('android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
mkdirSync(join('output', 'app'), { recursive: true });
const out = join('output', 'app', 'Nutslide-debug.apk');
copyFileSync(apk, out);
console.log(`\n만들었습니다: ${out} (${(statSync(out).size / 1024 / 1024).toFixed(1)}MB)`);
