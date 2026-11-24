
"""Per-client temporal logic: gesture smoothing and event detection."""

from __future__ import annotations

import math
import threading
import time
from collections import Counter, deque
from dataclasses import dataclass, field

from .classifier import HELLO, YES, NO, THANK_YOU, UNKNOWN

SMOOTH_WINDOW = 5
SMOOTH_MIN_VOTES = 3
SMOOTH_MAX_AGE = 1.5

NEAR_CHIN = 0.5
ARM_WINDOW = 1.8
MOVE_AWAY = 0.6
FACE_MEMORY = 1.0
FORWARD_GROWTH = 1.3
HOLD = 1.2

# A neutral hand must be detected for this long before another
# static gesture event can be emitted.
NEUTRAL_RESET_TIME = 0.8

STATIC_GESTURES = {HELLO, YES, NO}


@dataclass
class Face:
    chin: tuple[float, float]
    width: float
    seen_at: float


@dataclass
class Session:
    history: deque = field(
        default_factory=lambda: deque(maxlen=SMOOTH_WINDOW)
    )

    last_face: Face | None = None
    armed_at: float | None = None
    armed_pos: tuple[float, float] | None = None
    armed_scale: float = 0.0
    thank_you_until: float = 0.0

    # Static gesture event control
    gesture_armed: bool = True
    neutral_since: float | None = None
    last_event_gesture: str | None = None

    last_seen: float = field(default_factory=time.monotonic)


def _dist(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


class SessionStore:
    def __init__(self, ttl: float = 60.0):
        self._ttl = ttl
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()

    def get(self, client_id: str) -> Session:
        now = time.monotonic()

        with self._lock:
            expired = [
                cid
                for cid, session in self._sessions.items()
                if now - session.last_seen > self._ttl
            ]

            for cid in expired:
                del self._sessions[cid]

            session = self._sessions.setdefault(client_id, Session())
            session.last_seen = now
            return session

    def reset(self, client_id: str) -> None:
        with self._lock:
            self._sessions.pop(client_id, None)

    def __len__(self) -> int:
        return len(self._sessions)


def update_session(
    session: Session,
    raw_gesture: str,
    open_palm: bool,
    fingertips: tuple[float, float] | None,
    face: Face | None,
    hand_scale: float = 0.0,
    now: float | None = None,
    thank_you_enabled: bool = True,
) -> dict:
    """Process one frame and return the smoothed gesture and event."""

    now = time.monotonic() if now is None else now

    if face is not None:
        session.last_face = face
    elif (
        session.last_face
        and now - session.last_face.seen_at > FACE_MEMORY
    ):
        session.last_face = None

    face = session.last_face

    near_chin = False
    thank_you_now = False

    # THANK YOU motion detection
    if (
        thank_you_enabled
        and face is not None
        and fingertips is not None
        and open_palm
    ):
        distance = (
            _dist(fingertips, face.chin) / max(face.width, 1e-6)
        )

        near_chin = distance < NEAR_CHIN

        armed = (
            session.armed_at is not None
            and now - session.armed_at <= ARM_WINDOW
        )

        if armed:
            moved = (
                _dist(fingertips, session.armed_pos)
                / max(face.width, 1e-6)
            )

            not_upwards = (
                fingertips[1]
                >= session.armed_pos[1] - 0.2 * face.width
            )

            moved_away = moved > MOVE_AWAY and not_upwards

            grew = (
                session.armed_scale > 0
                and hand_scale / session.armed_scale > FORWARD_GROWTH
            )

            if moved_away or grew:
                thank_you_now = True
                session.thank_you_until = now + HOLD
                session.armed_at = None
                session.armed_pos = None
                session.history.clear()

                # The hand is still an open palm after THANK YOU.
                # Do not let it fire HELLO until the hand is neutral again.
                session.gesture_armed = False
                session.last_event_gesture = HELLO
                session.neutral_since = None

        if near_chin and not thank_you_now:
            if not armed:
                session.armed_pos = fingertips
                session.armed_scale = hand_scale

            session.armed_at = now

    if (
        session.armed_at is not None
        and now - session.armed_at > ARM_WINDOW
    ):
        session.armed_at = None
        session.armed_pos = None

    # An open palm near the chin is not HELLO.
    frame_gesture = raw_gesture

    if near_chin and raw_gesture == HELLO:
        frame_gesture = UNKNOWN

    session.history.append((now, frame_gesture))

    # THANK YOU is a motion event, held briefly for display.
    if thank_you_now or now < session.thank_you_until:
        return {
            "gesture": THANK_YOU,
            "stable": True,
            "event": thank_you_now,
            "pending": None,
        }

    # Remove stale frames before calculating votes.
    recent = [
        gesture
        for timestamp, gesture in session.history
        if now - timestamp <= SMOOTH_MAX_AGE
    ]

    stable_gesture, votes = (
        Counter(recent).most_common(1)[0]
        if recent
        else (UNKNOWN, 0)
    )

    stable = votes >= SMOOTH_MIN_VOTES
    reported_gesture = stable_gesture if stable else UNKNOWN

    event = False

    if stable:
        if reported_gesture in STATIC_GESTURES:
            # Emit once per gesture: again only after a neutral hand,
            # or straight away when the hand switches to a different gesture.
            session.neutral_since = None

            if (
                session.gesture_armed
                or reported_gesture != session.last_event_gesture
            ):
                event = True
                session.gesture_armed = False
                session.last_event_gesture = reported_gesture

        elif reported_gesture == UNKNOWN:
            # Require sustained neutral state before rearming.
            if session.neutral_since is None:
                session.neutral_since = now

            if (
                now - session.neutral_since
                >= NEUTRAL_RESET_TIME
            ):
                session.gesture_armed = True
                session.last_event_gesture = None

    return {
        "gesture": reported_gesture,
        "stable": stable,
        "event": event,
        "pending": (
            THANK_YOU if session.armed_at is not None else None
        ),
    }
