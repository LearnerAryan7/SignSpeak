
"""Rule-based classifier for static hand gestures."""

from __future__ import annotations

import math
from dataclasses import dataclass, field

Point = tuple[float, float, float]

HELLO = "HELLO"
YES = "YES"
NO = "NO"
THANK_YOU = "THANK YOU"
UNKNOWN = "Unknown"

FINGERS = {
    "index": (5, 6, 7, 8),
    "middle": (9, 10, 11, 12),
    "ring": (13, 14, 15, 16),
    "pinky": (17, 18, 19, 20),
}


def _dist(a: Point, b: Point) -> float:
    return math.dist(a[:2], b[:2])


def _angle(a: Point, b: Point, c: Point) -> float:
    """Calculate angle ABC using x/y coordinates."""

    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])

    n1 = math.hypot(*v1)
    n2 = math.hypot(*v2)

    if n1 == 0 or n2 == 0:
        return 180.0

    cos = max(
        -1.0,
        min(
            1.0,
            (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2),
        ),
    )

    return math.degrees(math.acos(cos))


@dataclass
class HandFeatures:
    extended: dict[str, bool] = field(default_factory=dict)
    folded: dict[str, bool] = field(default_factory=dict)

    thumb_extended: bool = False
    thumb_up: bool = False
    thumb_tucked: bool = False

    palm_size: float = 0.0
    fingertip_center: tuple[float, float] = (0.0, 0.0)

    @property
    def extended_count(self) -> int:
        return sum(self.extended.values())

    @property
    def folded_count(self) -> int:
        return sum(self.folded.values())

    @property
    def open_palm(self) -> bool:
        return self.extended_count == 4

    def as_dict(self) -> dict:
        return {
            "fingers_extended": self.extended,
            "thumb_extended": self.thumb_extended,
            "thumb_up": self.thumb_up,
        }


def extract_features(lm: list[Point]) -> HandFeatures:
    if len(lm) != 21:
        raise ValueError(
            f"expected 21 landmarks, got {len(lm)}"
        )

    wrist = lm[0]
    palm = _dist(wrist, lm[9]) or 1e-6

    features = HandFeatures(palm_size=palm)

    for name, (mcp, pip, dip, tip) in FINGERS.items():
        straight = _angle(lm[mcp], lm[pip], lm[tip])

        tip_far = (
            _dist(lm[tip], wrist)
            > _dist(lm[pip], wrist) * 1.15
        )

        features.extended[name] = (
            straight > 150 and tip_far
        )

        features.folded[name] = (
            _dist(lm[tip], wrist)
            < _dist(lm[pip], wrist)
            or straight < 95
        )

    # Thumb
    thumb_straight = _angle(lm[2], lm[3], lm[4]) > 140
    thumb_away = _dist(lm[4], lm[5]) > 0.55 * palm

    features.thumb_extended = (
        thumb_straight and thumb_away
    )

    # Image y coordinates increase downwards.
    dx = lm[4][0] - lm[2][0]
    dy = lm[4][1] - lm[2][1]

    highest_knuckle = min(
        lm[i][1] for i in (5, 9, 13, 17)
    )

    features.thumb_up = (
        features.thumb_extended
        and dy < 0
        and abs(dy) > abs(dx) * 1.2
        and lm[4][1] < highest_knuckle - 0.25 * palm
    )

    # Thumb tucked over or beside curled fingers.
    near_fingers = (
        min(
            _dist(lm[4], lm[i])
            for i in (6, 10, 14, 7, 11)
        )
        < 0.6 * palm
    )

    features.thumb_tucked = (
        near_fingers or not thumb_away
    )

    tips = [lm[i] for i in (8, 12, 16, 20)]

    features.fingertip_center = (
        sum(point[0] for point in tips) / 4,
        sum(point[1] for point in tips) / 4,
    )

    return features


def classify_static(
    lm: list[Point],
) -> tuple[str, float, HandFeatures]:
    """Return gesture, rule confidence score, and hand features."""

    features = extract_features(lm)

    if features.open_palm:
        score = (
            0.85 + (0.15 if features.thumb_extended else 0.0)
        )
        return HELLO, score, features

    if features.folded_count == 4:
        if features.thumb_up:
            return YES, 0.95, features

        if features.thumb_tucked:
            return NO, 0.9, features

    return UNKNOWN, 0.0, features
