"""Write the app's own Lottie animations, from the app's own palette.

Run from the mobile/ directory:

    python tool/generate_lottie.py

WHY THESE ARE GENERATED
-----------------------
Lottie files are normally an After Effects export, which means the only way to
change one is to have the project file, the plugin and the licence. These two
are small enough to describe directly, so they live here as code: the palette
is the same one the widgets use, the timing is the same easing the app uses,
and a change is a diff rather than a re-export.

Everything below loops SEAMLESSLY by construction. Every animated property
holds the same value at frame 0 and at the last frame, so the wrap is
invisible -- no cross-fade, no blink. That matters on a sign-in screen, where
the animation may be on screen for a minute while somebody hunts for their
password, and a visible restart every four seconds turns into a tic.

THE FILES
---------
sign_in.json    A pin settles over a place while workers circle it and the
                job is marked done. The screen's whole promise in one loop:
                somebody near you, at your address, finished.

secure.json     A shield draws itself and takes a check. Sits above the
                account form, where the ask is an email AND a phone number and
                the honest question in the user's head is "why do you want
                both".

empty.json      An open tray, two placeholders that never fill, one dot
error.json      drifting out. A ring and an exclamation, wobbling slightly.
offline.json    Signal arcs dropping away from the outside in.
done.json       A ring and a check, drawn in that order.

                Those four are AppStateView's tones -- neutral, error, warning
                and success -- so every empty, failed, offline and finished
                screen in the app is one of them. They deliberately share a
                shape: same disc, same drawn-on stroke, same breath.
"""

from __future__ import annotations

import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.dirname(HERE)
OUT = os.path.join(MOBILE, 'assets', 'lottie')

FR = 60

# ── Palette, from lib/design/tokens/colors.dart ───────────────────────────
BLUE_500 = '#4A7DF0'
BLUE_600 = '#2E5FD9'
BLUE_700 = '#2249AD'
SUCCESS = '#16A34A'
AMBER = '#F59E0B'
WHITE = '#FFFFFF'
SOFT = '#E7EEFD'
SOFT_DEEP = '#D6E2FB'

# ── Easing, as cubic-bezier control points ────────────────────────────────
# Lottie stores both control points on the EARLIER keyframe: `o` is that
# keyframe's out tangent, `i` the next one's in tangent, together forming
# cubic-bezier(o.x, o.y, i.x, i.y).
LINEAR = ((0.0, 0.0), (1.0, 1.0))
EASE_OUT = ((0.16, 1.0), (0.30, 1.0))
EASE_IN_OUT = ((0.45, 0.0), (0.25, 1.0))
EASE_IN = ((0.55, 0.0), (0.85, 0.35))


def col(hex_colour: str) -> list[float]:
    """Lottie colours are 0..1 floats, not bytes."""
    h = hex_colour.lstrip('#')
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [1.0]


def fixed(value):
    return {'a': 0, 'k': value}


def keys(frames):
    """[(frame, value, easing), ...] -> an animated Lottie property.

    The final entry needs no easing; anything given for it is ignored, which
    is why callers may pass the same tuple shape throughout.
    """
    out = []
    for index, entry in enumerate(frames):
        frame, value = entry[0], entry[1]
        ease = entry[2] if len(entry) > 2 else EASE_IN_OUT
        keyframe = {'t': frame, 's': value if isinstance(value, list) else [value]}
        if index < len(frames) - 1:
            (ox, oy), (ix, iy) = ease
            keyframe['o'] = {'x': [ox], 'y': [oy]}
            keyframe['i'] = {'x': [ix], 'y': [iy]}
        out.append(keyframe)
    return {'a': 1, 'k': out}


# ── Shape primitives ──────────────────────────────────────────────────────

def ellipse(width: float, height: float, centre=(0, 0)):
    return {'ty': 'el', 'd': 1, 's': fixed([width, height]), 'p': fixed(list(centre))}


def rect(width: float, height: float, radius: float, centre=(0, 0)):
    return {'ty': 'rc', 'd': 1, 's': fixed([width, height]), 'p': fixed(list(centre)),
            'r': fixed(radius)}


def path(points, closed: bool = True):
    """[(x, y, in_tangent, out_tangent), ...] with tangents RELATIVE to the vertex."""
    return {
        'ty': 'sh',
        'ks': fixed({
            'c': closed,
            'v': [[p[0], p[1]] for p in points],
            'i': [list(p[2]) if len(p) > 2 else [0, 0] for p in points],
            'o': [list(p[3]) if len(p) > 3 else [0, 0] for p in points],
        }),
    }


def fill(colour: str, opacity=100):
    return {'ty': 'fl', 'c': fixed(col(colour)),
            'o': opacity if isinstance(opacity, dict) else fixed(opacity), 'r': 1}


def stroke(colour: str, width, opacity=100):
    return {'ty': 'st', 'c': fixed(col(colour)),
            'o': opacity if isinstance(opacity, dict) else fixed(opacity),
            'w': width if isinstance(width, dict) else fixed(width),
            'lc': 2, 'lj': 2}


def trim(start=0, end=100, offset=0):
    return {'ty': 'tm',
            's': start if isinstance(start, dict) else fixed(start),
            'e': end if isinstance(end, dict) else fixed(end),
            'o': offset if isinstance(offset, dict) else fixed(offset),
            'm': 1}


def transform(position=(0, 0), anchor=(0, 0), scale=(100, 100), rotation=0, opacity=100):
    def prop(value, default_list=False):
        if isinstance(value, dict):
            return value
        return fixed(list(value) if default_list else value)

    return {'ty': 'tr',
            'p': prop(position, True), 'a': prop(anchor, True), 's': prop(scale, True),
            'r': prop(rotation), 'o': prop(opacity), 'sk': fixed(0), 'sa': fixed(0)}


def group(*items, **kwargs):
    return {'ty': 'gr', 'it': list(items) + [transform(**kwargs)]}


# NOTE ON ORDER, which costs an hour every time it is forgotten:
# a shape layer's items -- and a composition's layers -- are painted from the
# END of the list forwards, so THE FIRST ENTRY IS ON TOP. Listing them the way
# a painter works, background first, hides everything except the background.


def layer(index: int, name: str, shapes, *, position=(0, 0), anchor=(0, 0),
          scale=(100, 100), rotation=0, opacity=100, duration: int):
    def prop(value, three=False):
        if isinstance(value, dict):
            return value
        if three:
            return fixed(list(value) + [0])
        return fixed(list(value) if isinstance(value, (list, tuple)) else value)

    return {
        'ddd': 0, 'ind': index, 'ty': 4, 'nm': name, 'sr': 1, 'ao': 0, 'bm': 0,
        'ks': {
            'o': prop(opacity), 'r': prop(rotation),
            'p': prop(position, three=True), 'a': prop(anchor, three=True),
            's': prop(scale, three=True),
        },
        'shapes': shapes if isinstance(shapes, list) else [shapes],
        'ip': 0, 'op': duration, 'st': 0,
    }


def animation(name: str, width: int, height: int, duration: int, layers):
    return {'v': '5.7.4', 'fr': FR, 'ip': 0, 'op': duration,
            'w': width, 'h': height, 'nm': name, 'ddd': 0, 'assets': [], 'layers': layers}


# ── A ripple that repeats without a seam ──────────────────────────────────

def _sample_ripple(u: float, floor: float, ceiling: float, peak: float):
    """One ripple's scale and opacity at phase [0, 1)."""
    scale = floor + (ceiling - floor) * u
    # Fades in over the first sixth, then out for the rest, so a ring never
    # snaps into existence at full strength.
    opacity = peak * min(1.0, u / 0.16) * (1.0 - u) ** 1.3
    return scale, opacity


def ripple_keys(period: int, offset: int, total: int, floor=26.0, ceiling=132.0, peak=62.0):
    """Scale and opacity tracks for a ring that restarts every [period] frames.

    Sampled and interpolated LINEARLY rather than eased, and clipped to the
    composition by interpolating a keyframe at each end. That is what makes the
    value at frame 0 exactly equal the value at [total]: the ring is mid-flight
    at the wrap and lands on the same point of its cycle either side of it.
    """
    steps = 12
    samples = []
    cycle = -period + offset % period
    while cycle < total + period:
        for step in range(steps + 1):
            u = step / steps
            frame = cycle + u * period
            # The very end of a cycle and the start of the next are the same
            # instant; keep the second so a new ring starts from `floor`.
            if samples and abs(samples[-1][0] - frame) < 1e-6:
                samples.pop()
            samples.append((frame, *_sample_ripple(min(u, 0.999999), floor, ceiling, peak)))
        cycle += period

    def clip(track_index):
        clipped = []
        for i, sample in enumerate(samples):
            frame = sample[0]
            value = sample[track_index]
            if frame < 0 or frame > total:
                # Interpolate onto the boundary instead of dropping the sample,
                # or the first visible frame would jump.
                for edge in (0, total):
                    neighbour = samples[i + 1] if frame < edge else samples[i - 1]
                    if (frame - edge) * (neighbour[0] - edge) < 0:
                        span = neighbour[0] - frame
                        t = (edge - frame) / span
                        clipped.append((edge, value + (neighbour[track_index] - value) * t))
                continue
            clipped.append((frame, value))
        # Round to whole frames; Lottie players are happy with fractions but
        # whole numbers keep the file readable.
        merged = []
        for frame, value in clipped:
            frame = round(frame, 2)
            if merged and merged[-1][0] == frame:
                continue
            merged.append((frame, value))
        return merged

    scale_track = clip(1)
    opacity_track = clip(2)
    return (
        keys([(f, [v, v], LINEAR) for f, v in scale_track]),
        keys([(f, v, LINEAR) for f, v in opacity_track]),
    )


# ── sign_in.json ──────────────────────────────────────────────────────────

W, H = 600, 360
PIN_TIP = (300.0, 262.0)
ORBIT = (300.0, 264.0, 168.0, 56.0)   # cx, cy, rx, ry
DURATION = 240


def _pin_shape():
    """A map pin whose tip is the local origin.

    The head is a 42-unit circle centred 58 above the tip; the two flanks bulge
    out slightly on the way down so the silhouette narrows into the point
    rather than tapering as a straight cone.
    """
    k = 42 * 0.5523   # circle-to-bezier constant, for the two head quarters
    return path([
        (0, 14, (-10, -30), (10, -30)),
        (40, -56, (6, 26), (0, -k)),
        (0, -98, (k, 0), (-k, 0)),
        (-40, -56, (0, -k), (-6, 26)),
    ])


def _check_shape(width: float = 1.0):
    """An open three-point check, sized around its own centre."""
    return path([
        (-14 * width, 0 * width),
        (-4 * width, 11 * width),
        (16 * width, -12 * width),
    ], closed=False)


def _orbit_dot(index: int, name: str, colour: str, phase: float):
    """A worker circling the address.

    The dot rides an ellipse rather than a circle so the path reads as ground
    rather than as a halo, and it grows and brightens at the front of the
    sweep — which is the whole reason to use an ellipse: without the depth cue
    the near and far halves look like the same flat orbit.
    """
    cx, cy, rx, ry = ORBIT
    steps = 24
    position, scale, opacity = [], [], []
    for step in range(steps + 1):
        frame = round(DURATION * step / steps, 2)
        theta = phase + 2 * math.pi * step / steps
        x = cx + rx * math.cos(theta)
        y = cy + ry * math.sin(theta)
        # sin(theta) = +1 at the front of the sweep, -1 at the back.
        depth = (math.sin(theta) + 1) / 2
        position.append((frame, [x, y, 0], LINEAR))
        size = 78 + 44 * depth
        scale.append((frame, [size, size], LINEAR))
        opacity.append((frame, 42 + 58 * depth, LINEAR))

    return layer(
        index, name,
        [group(ellipse(22, 22), fill(colour)),
         group(ellipse(46, 46), fill(colour, fixed(16)))],
        position=keys(position), scale=keys(scale), opacity=keys(opacity),
        duration=DURATION,
    )


def sign_in() -> dict:
    cx, cy, _, _ = ORBIT

    # The pin's whole rig — head, tail, dish and check — hangs off one layer so
    # the bob moves all of it together.
    pin = layer(
        1, 'pin',
        [
            group(_check_shape(0.82),
                  trim(end=keys([
                      (0, 0, LINEAR), (52, 0, EASE_OUT), (76, 100, LINEAR),
                      (206, 100, EASE_IN), (232, 0, LINEAR), (DURATION, 0),
                  ])),
                  stroke(BLUE_600, 8),
                  position=(0, -58)),
            group(ellipse(44, 44, (0, -58)), fill(WHITE)),
            group(_pin_shape(), fill(BLUE_600)),
        ],
        position=keys([
            (0, [PIN_TIP[0], PIN_TIP[1], 0], EASE_IN_OUT),
            (120, [PIN_TIP[0], PIN_TIP[1] - 14, 0], EASE_IN_OUT),
            (DURATION, [PIN_TIP[0], PIN_TIP[1], 0]),
        ]),
        duration=DURATION,
    )

    # The contact shadow tightens as the pin rises, which is what sells the bob
    # as height rather than as the whole drawing sliding up the screen.
    shadow = layer(
        2, 'shadow',
        [group(ellipse(96, 26), fill(BLUE_700))],
        position=(cx, cy + 4),
        scale=keys([(0, [100, 100], EASE_IN_OUT), (120, [82, 82], EASE_IN_OUT),
                    (DURATION, [100, 100])]),
        opacity=keys([(0, 16, EASE_IN_OUT), (120, 10, EASE_IN_OUT), (DURATION, 16)]),
        duration=DURATION,
    )

    dots = [
        _orbit_dot(3, 'worker-a', BLUE_500, 0.0),
        _orbit_dot(4, 'worker-b', SUCCESS, 2 * math.pi / 3),
        _orbit_dot(5, 'worker-c', AMBER, 4 * math.pi / 3),
    ]

    rings = []
    for i, (offset, colour) in enumerate([(0, BLUE_500), (80, BLUE_500), (160, BLUE_600)]):
        scale, opacity = ripple_keys(240, offset, DURATION)
        rings.append(layer(
            6 + i, 'ripple-%d' % i,
            [group(ellipse(340, 116), stroke(colour, 6))],
            position=(cx, cy), scale=scale, opacity=opacity, duration=DURATION,
        ))

    backdrop = layer(
        9, 'backdrop',
        # Sized so the outer disc still clears the canvas at its 104% breath.
        # A backdrop that overruns the frame gets a flat edge where it is
        # cropped, and a circle with one straight side looks like a mistake.
        [group(ellipse(240, 240), fill(SOFT_DEEP, fixed(55))),
         group(ellipse(320, 320), fill(SOFT))],
        position=(cx + 4, cy - 72),
        scale=keys([(0, [100, 100], EASE_IN_OUT), (120, [104, 104], EASE_IN_OUT),
                    (DURATION, [100, 100])]),
        duration=DURATION,
    )

    return animation('gid-sign-in', W, H, DURATION, [pin, shadow] + dots + rings + [backdrop])


# ── secure.json ───────────────────────────────────────────────────────────

SW, SH = 440, 400
SHIELD_CENTRE = (220.0, 190.0)


def _shield_shape():
    """A shield, drawn around its own centre.

    Flat across the shoulders, straight down the flanks for two thirds, then
    both sides sweep into a point. Bezier tangents on the lower half only —
    the top is deliberately crisp, so the drawn-on stroke has a clear place to
    start and finish.
    """
    return path([
        (0, -96, (-70, 0), (70, 0)),
        (74, -68, (0, 0), (0, 0)),
        (74, 10, (0, -30), (0, 34)),
        (0, 96, (52, -34), (-52, -34)),
        (-74, 10, (0, 34), (0, -30)),
        (-74, -68, (0, 0), (0, 0)),
    ])


def _chip(index: int, name: str, shapes, centre, phase: int, duration: int):
    """A small floating card. [phase] staggers the bob so the two never move
    in lockstep, which is what stops them reading as one rigid object."""
    half = duration // 2
    return layer(
        index, name, shapes,
        position=keys([
            (0, [centre[0], centre[1], 0], EASE_IN_OUT),
            ((half + phase) % duration, [centre[0], centre[1] - 12, 0], EASE_IN_OUT),
            (duration, [centre[0], centre[1], 0]),
        ]),
        duration=duration,
    )


def secure() -> dict:
    duration = 240
    cx, cy = SHIELD_CENTRE

    outline = layer(
        1, 'shield-outline',
        [group(_shield_shape(),
               trim(end=keys([
                   (0, 0, LINEAR), (10, 0, EASE_OUT), (70, 100, LINEAR),
                   (196, 100, EASE_IN), (232, 0, LINEAR), (duration, 0),
               ])),
               stroke(BLUE_600, 9))],
        position=(cx, cy), duration=duration,
    )

    body = layer(
        2, 'shield-body',
        [group(_shield_shape(), fill(SOFT))],
        position=(cx, cy),
        opacity=keys([(0, 0, LINEAR), (56, 0, EASE_OUT), (86, 100, LINEAR),
                      (196, 100, EASE_IN), (222, 0, LINEAR), (duration, 0)]),
        duration=duration,
    )

    check = layer(
        3, 'shield-check',
        [group(_check_shape(1.5),
               trim(end=keys([
                   (0, 0, LINEAR), (86, 0, EASE_OUT), (114, 100, LINEAR),
                   (196, 100, EASE_IN), (218, 0, LINEAR), (duration, 0),
               ])),
               stroke(SUCCESS, 12))],
        position=(cx, cy - 4), duration=duration,
    )

    # Envelope: a card with its flap as two strokes meeting in the middle.
    envelope = _chip(
        4, 'email',
        [group(path([(-34, -16), (0, 12), (34, -16)], closed=False), stroke(BLUE_500, 6)),
         group(rect(104, 76, 16), stroke(BLUE_500, 6), fill(WHITE))],
        (84, 118), 0, duration,
    )

    # Handset: a card with a speaker slot and a home dot.
    handset = _chip(
        5, 'phone',
        [group(ellipse(9, 9, (0, 38)), fill(BLUE_500)),
         group(rect(24, 5, 3, (0, -38)), fill(BLUE_500)),
         group(rect(70, 108, 18), stroke(BLUE_500, 6), fill(WHITE))],
        (356, 132), 90, duration,
    )

    rings = []
    for i, offset in enumerate([0, 120]):
        scale, opacity = ripple_keys(240, offset, duration, floor=52.0, ceiling=118.0, peak=34.0)
        rings.append(layer(
            6 + i, 'halo-%d' % i,
            [group(ellipse(300, 300), stroke(BLUE_500, 5))],
            position=(cx, cy), scale=scale, opacity=opacity, duration=duration,
        ))

    backdrop = layer(
        8, 'backdrop',
        [group(ellipse(320, 320), fill(SOFT, fixed(70)))],
        position=(cx, cy),
        scale=keys([(0, [100, 100], EASE_IN_OUT), (120, [105, 105], EASE_IN_OUT),
                    (duration, [100, 100])]),
        duration=duration,
    )

    return animation('gid-secure', SW, SH, duration,
                     [check, outline, body, envelope, handset] + rings + [backdrop])



# ── The four states a screen can be in ────────────────────────────────────
#
# Every empty, failed, offline and finished screen in the app draws from this
# set, chosen by AppStateView's tone. They share a shape deliberately: the same
# soft disc, the same drawn-on stroke, the same breathing. A user who has seen
# one recognises the next as the app talking about itself rather than as a
# picture of something.
#
# Icons used to do this job. A glyph in a tinted circle is a LABEL for a state;
# these are a small piece of behaviour, which is what makes an empty screen
# feel attended to instead of broken.

DANGER = '#DC2626'
DANGER_SOFT = '#FEE2E2'
WARNING = '#F59E0B'
WARNING_SOFT = '#FEF3C7'
SUCCESS_SOFT = '#DCFCE7'

STATE_W, STATE_H = 440, 340
STATE_CENTRE = (220.0, 168.0)
STATE_DURATION = 240


def _state_backdrop(index, colour, *, diameter=250, duration=STATE_DURATION):
    """The disc every state sits on, breathing so the screen is never still."""
    cx, cy = STATE_CENTRE
    return layer(
        index, 'backdrop',
        [group(ellipse(diameter, diameter), fill(colour))],
        position=(cx, cy),
        scale=keys([(0, [100, 100], EASE_IN_OUT), (120, [105, 105], EASE_IN_OUT),
                    (duration, [100, 100])]),
        duration=duration,
    )


def _drawn(end_track_frames):
    """A trim that draws a stroke on, holds it, and takes it off again.

    [end_track_frames] is (start, drawn, hold_until, gone) in frames. Ending at
    zero is what lets the loop wrap without a cut.
    """
    a, b, c, d = end_track_frames
    return trim(end=keys([
        (0, 0, LINEAR), (a, 0, EASE_OUT), (b, 100, LINEAR),
        (c, 100, EASE_IN), (d, 0, LINEAR), (STATE_DURATION, 0),
    ]))


def empty() -> dict:
    """Nothing here yet.

    An open tray with two placeholder bars that never fill, and one dot that
    drifts up out of it. The dot is the whole idea: something LEFT, or has not
    arrived — not that the app is broken.
    """
    cx, cy = STATE_CENTRE

    dot = layer(
        1, 'drift',
        [group(ellipse(20, 20), fill(BLUE_500))],
        position=keys([
            (0, [cx, cy + 6, 0], EASE_OUT),
            (150, [cx, cy - 96, 0], LINEAR),
            (STATE_DURATION, [cx, cy + 6, 0]),
        ]),
        opacity=keys([(0, 0, EASE_OUT), (40, 70, LINEAR), (150, 0, LINEAR),
                      (STATE_DURATION, 0)]),
        duration=STATE_DURATION,
    )

    bars = layer(
        2, 'placeholders',
        [group(rect(96, 12, 6, (0, -16)), fill(BLUE_500, fixed(28))),
         group(rect(64, 12, 6, (0, 12)), fill(BLUE_500, fixed(20)))],
        position=(cx, cy + 26),
        opacity=keys([(0, 0, EASE_OUT), (76, 100, LINEAR), (196, 100, EASE_IN),
                      (222, 0, LINEAR), (STATE_DURATION, 0)]),
        duration=STATE_DURATION,
    )

    # The tray: a rounded rectangle with its top edge open, drawn as a path so
    # the trim has somewhere to start and finish.
    tray = layer(
        3, 'tray',
        [group(path([(-92, -54), (-92, 44), (92, 44), (92, -54)], closed=False),
               _drawn((10, 66, 196, 228)),
               stroke(BLUE_600, 9))],
        position=(cx, cy + 20), duration=STATE_DURATION,
    )

    return animation('gid-empty', STATE_W, STATE_H, STATE_DURATION,
                     [dot, bars, tray, _state_backdrop(4, SOFT)])


def failed() -> dict:
    """Something went wrong.

    A ring and an exclamation, with a wobble small enough to read as concern
    rather than as an alarm. Errors in this app are usually a flaky connection,
    not a catastrophe, and the artwork should not overstate them.
    """
    cx, cy = STATE_CENTRE

    mark = layer(
        1, 'exclamation',
        [group(ellipse(16, 16, (0, 42)), fill(DANGER)),
         group(rect(16, 66, 8, (0, -6)), fill(DANGER))],
        position=(cx, cy),
        opacity=keys([(0, 0, EASE_OUT), (76, 100, LINEAR), (196, 100, EASE_IN),
                      (218, 0, LINEAR), (STATE_DURATION, 0)]),
        duration=STATE_DURATION,
    )

    ring = layer(
        2, 'ring',
        [group(ellipse(190, 190), _drawn((10, 70, 196, 230)), stroke(DANGER, 10))],
        position=(cx, cy),
        # Four keyframes back to zero, so the wobble is symmetric and the loop
        # point is the rest position rather than the end of a swing.
        rotation=keys([(0, 0, EASE_IN_OUT), (90, 3, EASE_IN_OUT), (120, 0, EASE_IN_OUT),
                       (150, -3, EASE_IN_OUT), (STATE_DURATION, 0)]),
        duration=STATE_DURATION,
    )

    return animation('gid-error', STATE_W, STATE_H, STATE_DURATION,
                     [mark, ring, _state_backdrop(3, DANGER_SOFT)])


def offline() -> dict:
    """No connection.

    The signal arcs drop away from the outside in and come back, which is what
    a bad connection actually does. Phrased as temporary on purpose: the app
    reconnects on its own and the picture should say so.
    """
    cx, cy = STATE_CENTRE
    base = (cx, cy + 62)

    dot = layer(
        1, 'source',
        [group(ellipse(24, 24), fill(WARNING))],
        position=base, duration=STATE_DURATION,
    )

    arcs = []
    for i, (diameter, out_at, back_at) in enumerate([(96, 52, 196), (162, 78, 170), (228, 104, 144)]):
        arcs.append(layer(
            2 + i, 'arc-%d' % i,
            # An ellipse path starts at twelve o'clock and runs clockwise, so a
            # quarter of it offset back by 45 degrees is the arc above the dot.
            [group(ellipse(diameter, diameter),
                   trim(start=0, end=25, offset=-45),
                   stroke(WARNING, 11))],
            position=base,
            opacity=keys([
                (0, 100, EASE_IN), (out_at, 100, EASE_IN), (out_at + 24, 12, LINEAR),
                (back_at, 12, EASE_OUT), (back_at + 30, 100, LINEAR),
                (STATE_DURATION, 100),
            ]),
            duration=STATE_DURATION,
        ))

    return animation('gid-offline', STATE_W, STATE_H, STATE_DURATION,
                     [dot] + arcs + [_state_backdrop(5, WARNING_SOFT)])


def done() -> dict:
    """Finished. A ring and a check, drawn in that order."""
    cx, cy = STATE_CENTRE

    tick = layer(
        1, 'check',
        [group(_check_shape(2.2), _drawn((72, 104, 196, 218)), stroke(SUCCESS, 14))],
        position=(cx, cy - 4), duration=STATE_DURATION,
    )

    ring = layer(
        2, 'ring',
        [group(ellipse(190, 190), _drawn((10, 70, 196, 230)), stroke(SUCCESS, 10))],
        position=(cx, cy), duration=STATE_DURATION,
    )

    return animation('gid-done', STATE_W, STATE_H, STATE_DURATION,
                     [tick, ring, _state_backdrop(3, SUCCESS_SOFT)])


def _check_seam(document: dict) -> None:
    """Fail loudly if any track ends somewhere other than where it started.

    The whole design claim of these files is that they loop without a seam, and
    that claim is one arithmetic slip away from being false at any time.
    """
    end = document['op']

    def walk(node, where):
        if isinstance(node, dict):
            if node.get('a') == 1 and isinstance(node.get('k'), list) and node['k']:
                first, last = node['k'][0], node['k'][-1]
                if first['t'] != 0 or last['t'] != end:
                    raise SystemExit('%s: track spans %s..%s, not 0..%d'
                                     % (where, first['t'], last['t'], end))
                if any(abs(a - b) > 0.01 for a, b in zip(first['s'], last['s'])):
                    raise SystemExit('%s: loops from %s to %s' % (where, first['s'], last['s']))
            for key, value in node.items():
                walk(value, '%s.%s' % (where, key))
        elif isinstance(node, list):
            for item in node:
                walk(item, where)

    for layer_json in document['layers']:
        walk(layer_json, '%s/%s' % (document['nm'], layer_json['nm']))


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, builder in [('sign_in', sign_in), ('secure', secure),
                          ('empty', empty), ('error', failed),
                          ('offline', offline), ('done', done)]:
        document = builder()
        _check_seam(document)
        target = os.path.join(OUT, '%s.json' % name)
        with open(target, 'w', encoding='utf-8', newline='\n') as handle:
            json.dump(document, handle, separators=(',', ':'))
        print('  assets/lottie/%s.json (%d layers, %.1fs, %.1f KB)'
              % (name, len(document['layers']), document['op'] / FR,
                 os.path.getsize(target) / 1024))


if __name__ == '__main__':
    main()
