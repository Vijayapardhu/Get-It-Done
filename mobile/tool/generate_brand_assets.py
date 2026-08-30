"""Draw the GET IT DONE brand assets from the app's own palette.

Run from the mobile/ directory:

    python tool/generate_brand_assets.py

Everything here is generated rather than hand-drawn so the identity can be
regenerated at any size without a designer round trip, and so the colours can
never drift from lib/design/tokens/colors.dart -- they are copied once, at the
top of this file, and nowhere else.

THE MARK
--------
A rounded square carrying a check whose two strokes are weighted differently:
the short stroke is a translucent white, the long one solid. Read quickly it is
a tick -- work finished. Read slowly it is two strokes meeting, which is the
cooperative idea the app is built on: one hand meeting another.

The rounded square is not decoration either. Every tile in the app -- service
artwork, icon badges, the avatar -- is a rounded square, so the launcher icon is
the same object the user meets on every screen inside.
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFont

# ── Palette, from lib/design/tokens/colors.dart ───────────────────────────
BLUE_500 = (0x4A, 0x7D, 0xF0)
BLUE_600 = (0x2E, 0x5F, 0xD9)
BLUE_700 = (0x22, 0x49, 0xAD)
BLUE_900 = (0x14, 0x28, 0x5C)
WHITE = (0xFF, 0xFF, 0xFF)

HERE = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.dirname(HERE)
RES = os.path.join(MOBILE, 'android', 'app', 'src', 'main', 'res')
BRAND = os.path.join(MOBILE, 'assets', 'brand')

# Supersampling factor. Pillow has no anti-aliased polygon fill, so everything
# is drawn at 4x and resized down with LANCZOS -- which is what gives the
# diagonal strokes of the check a clean edge instead of a staircase.
SS = 4


def _gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    """A vertical gradient. Flat blue over a third of a screen goes heavy; the
    same is true of an icon sitting on a bright launcher wallpaper."""
    grad = Image.new('RGB', (1, size))
    pixels = grad.load()
    for y in range(size):
        t = y / max(1, size - 1)
        pixels[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return grad.resize((size, size), Image.Resampling.BICUBIC)


def _rounded_mask(size: int, radius_ratio: float) -> Image.Image:
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1),
        radius=round(size * radius_ratio),
        fill=255,
    )
    return mask


def _check(size: int, stroke: float = 0.105) -> Image.Image:
    """The check, as a transparent layer sized to the given box.

    Coordinates are fractions of the box so the shape is identical at 48px and
    at 1024px. The long stroke overshoots its corner slightly, which is what
    stops a thick round-capped check from looking stubby.
    """
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    w = round(size * stroke)

    def at(fx: float, fy: float) -> tuple[int, int]:
        return round(size * fx), round(size * fy)

    # The short stroke, translucent: the second hand in the handshake.
    draw.line([at(0.255, 0.520), at(0.435, 0.700)], fill=WHITE + (150,), width=w, joint='curve')
    for point in (at(0.255, 0.520), at(0.435, 0.700)):
        draw.ellipse(
            [point[0] - w // 2, point[1] - w // 2, point[0] + w // 2, point[1] + w // 2],
            fill=WHITE + (150,),
        )

    # The long stroke, solid.
    draw.line([at(0.420, 0.700), at(0.760, 0.320)], fill=WHITE + (255,), width=w, joint='curve')
    for point in (at(0.420, 0.700), at(0.760, 0.320)):
        draw.ellipse(
            [point[0] - w // 2, point[1] - w // 2, point[0] + w // 2, point[1] + w // 2],
            fill=WHITE + (255,),
        )

    return layer


def mark(size: int, *, padding: float = 0.0, radius_ratio: float = 0.235,
         transparent: bool = True) -> Image.Image:
    """The badge with its check.

    [padding] insets the badge inside the canvas, which is how the adaptive
    icon's foreground layer keeps the mark inside Android's safe zone while
    still filling a 108dp canvas.
    """
    big = size * SS
    canvas = Image.new('RGBA', (big, big), (0, 0, 0, 0) if transparent else BLUE_900 + (255,))

    inset = round(big * padding)
    badge_size = big - inset * 2
    if badge_size <= 0:
        raise ValueError('padding leaves no room for the badge')

    badge = _gradient(badge_size, BLUE_500, BLUE_700).convert('RGBA')
    badge.putalpha(_rounded_mask(badge_size, radius_ratio))
    badge.alpha_composite(_check(badge_size))

    canvas.alpha_composite(badge, (inset, inset))
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def _font(size: int) -> ImageFont.FreeTypeFont:
    """Plus Jakarta Sans if the project has it, otherwise whatever the system
    will give us. The wordmark is a convenience asset, not a spec — the real
    typography lives in the app's theme."""
    candidates = [
        os.path.join(MOBILE, 'assets', 'fonts', 'PlusJakartaSans-ExtraBold.ttf'),
        os.path.join(MOBILE, 'assets', 'fonts', 'PlusJakartaSans-Bold.ttf'),
        r'C:\Windows\Fonts\segoeuib.ttf',
        r'C:\Windows\Fonts\arialbd.ttf',
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def wordmark(height: int = 256, *, on_dark: bool = False) -> Image.Image:
    """Mark plus name, for a splash screen or a document header."""
    gap = round(height * 0.28)
    text_size = round(height * 0.46)
    font = _font(text_size)

    badge = mark(height)
    probe = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    box = probe.textbbox((0, 0), 'GET IT DONE', font=font)
    text_w, text_h = box[2] - box[0], box[3] - box[1]

    canvas = Image.new('RGBA', (height + gap + text_w, height), (0, 0, 0, 0))
    canvas.alpha_composite(badge, (0, 0))
    ImageDraw.Draw(canvas).text(
        (height + gap - box[0], (height - text_h) // 2 - box[1]),
        'GET IT DONE',
        font=font,
        fill=(WHITE if on_dark else BLUE_900) + (255,),
    )
    return canvas


def _save(image: Image.Image, *parts: str) -> None:
    path = os.path.join(*parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save(path, 'PNG')
    print('  %s (%dx%d)' % (os.path.relpath(path, MOBILE), image.width, image.height))


# ── The Google mark, for "Continue with Google" ───────────────────────────
#
# Google's sign-in branding guidelines require their own "G", not a generic
# person or key glyph — a button that says "Continue with Google" beside a
# stranger's icon is the shape a phishing page takes, and users are trained to
# look for this exact mark.
#
# Drawn rather than bundled so it scales to any density from one source. The
# four brand hexes below are Google's published values and must not be
# "improved" to fit our palette: the whole point of the mark is that it is
# theirs and looks it.
GOOGLE_BLUE = (0x42, 0x85, 0xF4)
GOOGLE_GREEN = (0x34, 0xA8, 0x53)
GOOGLE_YELLOW = (0xFB, 0xBC, 0x05)
GOOGLE_RED = (0xEA, 0x43, 0x35)


def google_g(size: int) -> Image.Image:
    """The four-colour G.

    Built as a ring cut into four arcs plus the blue bar that closes the G.
    PIL angles run clockwise from three o'clock, so north is 270.
    """
    big = size * SS
    canvas = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    pad = big * 0.03
    box = [pad, pad, big - pad, big - pad]
    outer = (big - pad * 2) / 2
    centre = big / 2
    # Google's own mark is a fairly light ring — roughly a third of the radius.
    # At 0.40 the counter shrank to a pinhole and the thing read as a coloured
    # pinwheel at 24px, which is the only size it is ever actually seen at.
    thickness = outer * 0.31
    inner = outer - thickness

    # The ring, in four arcs, deliberately NOT closed.
    #
    # The blue stroke runs PAST three o'clock and on down to about half four —
    # the bar leaves from the middle of it rather than from its end. Stopping
    # blue level with the bar instead, which is the intuitive thing to draw,
    # closes the whole upper ring above a centred crossbar and produces a
    # perfectly clean lowercase e. Four rounds of tuning the gap and the bar
    # could not fix that, because the arc length was the thing that was wrong.
    #
    # The opening is then the short span between blue's end and green's start,
    # low on the right, where the real mark puts it.
    for start_angle, end_angle, colour in [
        (76, 143, GOOGLE_GREEN),    # across the bottom
        (142, 198, GOOGLE_YELLOW),  # up the left flank
        (197, 311, GOOGLE_RED),     # over the top
        (310, 421, GOOGLE_BLUE),    # down the whole right flank, past the bar
    ]:
        draw.pieslice(box, start_angle, end_angle, fill=colour + (255,))

    # Punch the middle out to leave a ring.
    draw.ellipse(
        [centre - inner, centre - inner, centre + inner, centre + inner],
        fill=(0, 0, 0, 0),
    )

    # The bar that turns a C into a G.
    #
    # Centred on the horizontal, because that is where the blue arc's terminal
    # is: the arc is cut by a radial line at three o'clock, so a bar hung below
    # that line reads as a separate stroke sitting under a finished arc rather
    # than as the arc turning inward. It reaches out past the ring so the join
    # is solid, and stops at the centre so the counter stays open around its
    # left end — a bar that crosses the full width makes a lowercase e.
    draw.rectangle(
        [centre - inner * 0.02, centre - thickness / 2,
         centre + outer + pad, centre + thickness / 2],
        fill=GOOGLE_BLUE + (255,),
    )

    # Trim the bar back to the circle.
    ring = Image.new('L', (big, big), 0)
    ImageDraw.Draw(ring).ellipse(box, fill=255)
    canvas.putalpha(Image.composite(canvas.getchannel('A'), Image.new('L', (big, big), 0), ring))

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    print('launcher icons')
    # Legacy square icons, for Android 7 and below.
    for folder, size in [
        ('mipmap-mdpi', 48), ('mipmap-hdpi', 72), ('mipmap-xhdpi', 96),
        ('mipmap-xxhdpi', 144), ('mipmap-xxxhdpi', 192),
    ]:
        _save(mark(size), RES, folder, 'ic_launcher.png')

    print('adaptive foreground')
    # Android composites the foreground on the background and masks the result
    # to whatever shape the launcher uses, keeping the middle 66 of 108dp.
    #
    # 0.20 padding puts the badge at 65dp of that 108 -- filling the safe zone
    # rather than sitting timidly in the middle of it. At 0.28 the mark read as
    # a small tile adrift in a large blue circle on every round-icon launcher.
    # The badge's own heavy corner radius is what lets it run this close to the
    # circle without its corners being cut.
    for folder, size in [
        ('mipmap-mdpi', 108), ('mipmap-hdpi', 162), ('mipmap-xhdpi', 216),
        ('mipmap-xxhdpi', 324), ('mipmap-xxxhdpi', 432),
    ]:
        _save(mark(size, padding=0.20, radius_ratio=0.28), RES, folder, 'ic_launcher_foreground.png')

    print('brand assets')
    _save(mark(1024), BRAND, 'mark.png')
    _save(mark(512), BRAND, 'play_store_icon.png')
    _save(wordmark(256), BRAND, 'wordmark_light.png')
    _save(wordmark(256, on_dark=True), BRAND, 'wordmark_dark.png')
    _save(mark(512), BRAND, 'splash.png')
    # 96px: three times the 32dp the button draws it at, so the ring's
    # thin arcs survive the downscale on a 3x screen.
    _save(google_g(96), BRAND, 'google_g.png')

if __name__ == '__main__':
    main()
