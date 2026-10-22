from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

SIZE = 1024
TOP = (63, 97, 82)
BOTTOM = (31, 50, 41)
CREAM = (244, 238, 224)


def font(size):
    for path, index in (
        (r"C:\Windows\Fonts\simsun.ttc", 0),
        (r"C:\Windows\Fonts\msyh.ttc", 0),
        (r"C:\Windows\Fonts\simhei.ttf", 0),
    ):
        try:
            return ImageFont.truetype(path, size, index=index)
        except OSError:
            continue
    return ImageFont.load_default()


def build(maskable=False):
    image = Image.new("RGB", (SIZE, SIZE), TOP)
    draw = ImageDraw.Draw(image, "RGBA")
    for y in range(SIZE):
        t = y / (SIZE - 1)
        color = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        draw.line((0, y, SIZE, y), fill=color)

    draw.ellipse((-260, -420, 900, 520), fill=(96, 132, 112, 58))
    draw.ellipse((460, 560, 1360, 1320), fill=(20, 31, 26, 68))

    inset = 132 if maskable else 62
    draw.rounded_rectangle(
        (inset, inset, SIZE - inset, SIZE - inset),
        radius=180 if maskable else 196,
        outline=(244, 238, 224, 118),
        width=9,
    )

    glyph = "文"
    size = 520 if maskable else 574
    f = font(size)
    box = draw.textbbox((0, 0), glyph, font=f)
    x = (SIZE - (box[2] - box[0])) / 2 - box[0]
    y = (SIZE - (box[3] - box[1])) / 2 - box[1] - (10 if not maskable else 0)
    draw.text((x, y), glyph, font=f, fill=CREAM)

    line_y = 742 if not maskable else 716
    draw.rounded_rectangle(
        (SIZE / 2 - 62, line_y, SIZE / 2 + 62, line_y + 5),
        radius=3,
        fill=(244, 238, 224, 105),
    )
    return image


base = build(False)
maskable = build(True)
base.resize((512, 512), Image.LANCZOS).save(OUT / "icon-512.png", optimize=True)
base.resize((192, 192), Image.LANCZOS).save(OUT / "icon-192.png", optimize=True)
base.resize((180, 180), Image.LANCZOS).save(OUT / "apple-touch-icon.png", optimize=True)
maskable.resize((512, 512), Image.LANCZOS).save(OUT / "icon-maskable-512.png", optimize=True)
print("icons written:", *(str(path.name) for path in sorted(OUT.glob("*.png"))))
