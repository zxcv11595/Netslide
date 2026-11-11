# 본문 글꼴(Pretendard, OFL)을 게임에서 쓰는 글자만 담아 public/assets/fonts/에 만든다.
#   python tools/make-fonts.py
# 화면 문구에 새 글자를 넣었으면 다시 돌린다(빠진 글자는 기기의 기본 글꼴로 보여 모양이 섞인다).
# 필요한 것: Python의 fonttools·brotli, 그리고 PC에 설치된 Pretendard(C:\Windows\Fonts\Pretendard-*.ttf).
import glob, os, sys
from fontTools import subset
from fontTools.ttLib import TTFont

SRC_DIR = r'C:\Windows\Fonts'
OUT_DIR = os.path.join('public', 'assets', 'fonts')
WEIGHTS = {500: 'Medium', 700: 'Bold', 800: 'ExtraBold', 900: 'Black'}

# 게임에 나올 수 있는 글자: 소스·HTML에 적힌 모든 글자 + 영문·숫자·기호
chars = set(chr(c) for c in range(0x20, 0x7F))
chars |= set('₩×·…→←↑↓’‘“”—–•▶★☆♥°')
files = glob.glob('src/**/*.js', recursive=True) + glob.glob('*.html') + glob.glob('public/*.html')
for f in files:
    with open(f, encoding='utf-8') as fh:
        chars |= set(ch for ch in fh.read() if ord(ch) > 0x20)
text = ''.join(sorted(chars))

total = 0
for weight, name in WEIGHTS.items():
    src = os.path.join(SRC_DIR, f'Pretendard-{name}.ttf')
    if not os.path.exists(src):
        sys.exit(f'글꼴이 없습니다: {src}')
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'tnum', 'ccmp', 'locl']
    opts.name_IDs = [1, 2]
    opts.notdef_outline = True
    font = TTFont(src)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    out = os.path.join(OUT_DIR, f'pretendard-{weight}.woff2')
    font.flavor = 'woff2'
    font.save(out)
    size = os.path.getsize(out)
    total += size
    print(f'{out}  {size / 1024:.1f}KB')
hangul = sum(1 for ch in chars if '가' <= ch <= '힣')
print(f'글자 {len(chars)}개(한글 {hangul}개), 합계 {total / 1024:.0f}KB')
