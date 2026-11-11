# 앱 아이콘과 공유 미리보기 그림을 햄스터 그림으로 만든다.
#   python tools/make-icons.py
# 만드는 것(public/assets/icons/): icon-192·512(둥근 바탕), maskable-512(가장자리 여유), apple-touch-180, favicon-48, og.jpg(1200×630)
# 필요한 것: Python의 Pillow·fonttools. 그림 원본은 art-src/hamster-success.png, 제목 글꼴은 주아(public/assets/fonts/jua-subset.woff2).
import io, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont

OUT = os.path.join('public', 'assets', 'icons')
os.makedirs(OUT, exist_ok=True)
CREAM, PANEL, INK, POINT, SKY, PEACH = (255, 249, 238), (255, 241, 216), (85, 48, 29), (238, 150, 43), (207, 228, 232), (240, 205, 170)
ham = Image.open(os.path.join('art-src', 'hamster-success.png')).convert('RGBA')
ham = ham.crop(ham.getbbox())


def backdrop(size):
    """하늘빛 → 크림 → 살구빛으로 번지는 바탕(게임 배경과 같은 느낌)"""
    w, h = size
    img = Image.new('RGB', size, CREAM)
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        if t < 0.35:
            a, b, k = SKY, CREAM, t / 0.35
        elif t < 0.65:
            a, b, k = CREAM, CREAM, 0
        else:
            a, b, k = CREAM, PEACH, (t - 0.65) / 0.35
        c = tuple(round(a[i] + (b[i] - a[i]) * k) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img


def place(canvas, scale, cy=0.53):
    """햄스터를 canvas 폭의 scale 비율로 가운데에 놓는다"""
    w, h = canvas.size
    hw = round(w * scale)
    hh = round(ham.height * hw / ham.width)
    canvas.paste(ham.resize((hw, hh), Image.LANCZOS), ((w - hw) // 2, round(h * cy - hh / 2)), ham.resize((hw, hh), Image.LANCZOS))


def icon(size, scale, rounded):
    big = 1024
    img = backdrop((big, big)).convert('RGBA')
    d = ImageDraw.Draw(img)
    d.ellipse((big * 0.14, big * 0.16, big * 0.86, big * 0.88), fill=PANEL + (255,))
    place(img, scale)
    if rounded:
        mask = Image.new('L', (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * 0.22), fill=255)
        img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)


icon(192, 0.74, True).save(os.path.join(OUT, 'icon-192.png'))
icon(512, 0.74, True).save(os.path.join(OUT, 'icon-512.png'))
icon(512, 0.56, False).convert('RGB').save(os.path.join(OUT, 'maskable-512.png'))  # 기기가 모양을 잘라 쓰므로 여유를 둔다
icon(180, 0.70, False).convert('RGB').save(os.path.join(OUT, 'apple-touch-180.png'))
icon(48, 0.80, True).save(os.path.join(OUT, 'favicon-48.png'))

# 공유 미리보기(1200×630): 왼쪽에 이름과 한 줄 소개, 오른쪽에 햄스터
buf = io.BytesIO()
jua = TTFont(os.path.join('public', 'assets', 'fonts', 'jua-subset.woff2'))
jua.flavor = None
jua.save(buf)
font = lambda px: ImageFont.truetype(io.BytesIO(buf.getvalue()), px)
og = backdrop((1200, 630)).convert('RGBA')
d = ImageDraw.Draw(og)
d.ellipse((690, 95, 1130, 535), fill=PANEL + (255,))
hw = 400
hh = round(ham.height * hw / ham.width)
og.alpha_composite(ham.resize((hw, hh), Image.LANCZOS), (910 - hw // 2, 322 - hh // 2))
d.text((90, 190), 'Nutslide', font=font(150), fill=INK)
d.rounded_rectangle((92, 372, 560, 392), radius=10, fill=POINT)
d.text((94, 430), '슬라이드 퍼즐 게임', font=font(54), fill=INK)
og.convert('RGB').save(os.path.join(OUT, 'og.jpg'), quality=88)

for f in sorted(os.listdir(OUT)):
    print(f, f'{os.path.getsize(os.path.join(OUT, f)) / 1024:.0f}KB')

# 안드로이드 앱 아이콘(android 폴더가 있을 때만). 새 방식(둥근 틀에 맞춰 잘리는 그림)과 옛 방식 그림을 모두 만든다.
RES = os.path.join('android', 'app', 'src', 'main', 'res')
if os.path.isdir(RES):
    for name, dp in (('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)):
        d = os.path.join(RES, f'mipmap-{name}')
        legacy = round(48 * dp)
        icon(legacy, 0.74, True).save(os.path.join(d, 'ic_launcher.png'))
        rnd = icon(legacy * 4, 0.66, False)
        mask = Image.new('L', rnd.size, 0)
        ImageDraw.Draw(mask).ellipse((0, 0, rnd.width - 1, rnd.height - 1), fill=255)
        rnd.putalpha(mask)
        rnd.resize((legacy, legacy), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_round.png'))
        fg = round(108 * dp)  # 바깥 3분의 1은 잘릴 수 있어 그림을 가운데에 작게 둔다
        icon(fg, 0.50, False).save(os.path.join(d, 'ic_launcher_foreground.png'))
    print('안드로이드 아이콘을 만들었습니다.')
