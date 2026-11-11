// 게임을 빌드해서 GitHub Pages(gh-pages 가지)에 올린다: npm run deploy
// dist 안에서 임시 저장소를 만들어 그 내용만 gh-pages 가지로 밀어 넣는다(main 가지와 작업 파일은 건드리지 않는다).
// 주소: https://<계정>.github.io/<저장소 이름>/
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync } from 'node:fs';

const run = (cmd, cwd = '.') => execSync(cmd, { cwd, stdio: 'pipe' }).toString().trim();
const remote = run('git remote get-url origin');
const head = run('git rev-parse --short HEAD');
const dirty = run('git status --porcelain') !== '';

console.log('빌드 중…');
execSync('npm run build', { stdio: 'inherit' });
writeFileSync('dist/.nojekyll', ''); // 밑줄로 시작하는 파일도 그대로 내보내게 한다
if (existsSync('dist/.git')) rmSync('dist/.git', { recursive: true, force: true });

run('git init -q -b gh-pages', 'dist');
run('git add -A', 'dist');
run(`git -c user.name="deploy" -c user.email="deploy@users.noreply.github.com" commit -q -m "배포: ${head}${dirty ? ' (커밋 안 된 변경 포함)' : ''}"`, 'dist');
console.log('올리는 중…');
run(`git push -q --force "${remote}" gh-pages`, 'dist');
rmSync('dist/.git', { recursive: true, force: true });

const m = remote.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
console.log(m ? `올렸습니다: https://${m[1].toLowerCase()}.github.io/${m[2]}/ (반영까지 1~2분)` : '올렸습니다.');
