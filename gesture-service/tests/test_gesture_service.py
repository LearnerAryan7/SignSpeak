"""Tests for the gesture service: classifier, smoothing/events and the HTTP API.

No camera, MediaPipe model or extra packages are needed:
the API is called directly over ASGI with a fake detector.

Run from the gesture-service folder:
    python -m unittest discover -s tests -v
"""
import asyncio
import base64
import json
import math
import os
import sys
import unittest
import uuid

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import main  # noqa: E402
from app.classifier import HELLO, NO, THANK_YOU, UNKNOWN, YES, classify_static, extract_features  # noqa: E402
from app.detector import DetectionResult, HandResult  # noqa: E402
from app.session import Face, Session, SessionStore, update_session  # noqa: E402


# ---------------------------------------------------------------------------
# Synthetic MediaPipe-style hand landmarks (pixel coordinates, y down)
# ---------------------------------------------------------------------------

def _rotate(points, angle_deg, origin):
    a = math.radians(angle_deg)
    ox, oy = origin
    out = []
    for x, y, z in points:
        dx, dy = x - ox, y - oy
        out.append((ox + dx * math.cos(a) - dy * math.sin(a), oy + dx * math.sin(a) + dy * math.cos(a), z))
    return out


def _finger_straight(base_x, base_y, seg=22):
    # MCP, PIP, DIP, TIP going straight up
    return [(base_x, base_y - i * seg, 0.0) for i in range(4)]


def _finger_curled(base_x, base_y, seg=22):
    # MCP, PIP up a bit, DIP folds toward palm, TIP back near the palm
    mcp = (base_x, base_y, 0.0)
    pip = (base_x, base_y - seg, 0.0)
    dip = (base_x + 4, base_y - seg + 14, 0.0)
    tip = (base_x + 4, base_y + 10, 0.0)
    return [mcp, pip, dip, tip]


def make_hand(fingers_open: bool, thumb: str, center=(320, 300), rotate=0.0, scale=1.0):
    """thumb: 'out' (extended sideways), 'up' (thumbs up), 'tucked' (over the fist)."""
    cx, cy = center
    s = scale
    wrist = (cx, cy + 90 * s, 0.0)
    knuckle_y = cy
    xs = [cx - 30 * s, cx - 10 * s, cx + 10 * s, cx + 30 * s]

    pts = [wrist]
    if thumb == "out":
        pts += [(cx - 35 * s, cy + 70 * s, 0), (cx - 55 * s, cy + 50 * s, 0),
                (cx - 75 * s, cy + 30 * s, 0), (cx - 95 * s, cy + 10 * s, 0)]
    elif thumb == "up":
        pts += [(cx - 35 * s, cy + 40 * s, 0), (cx - 40 * s, cy + 10 * s, 0),
                (cx - 42 * s, cy - 25 * s, 0), (cx - 43 * s, cy - 60 * s, 0)]
    else:  # tucked across the curled fingers
        pts += [(cx - 35 * s, cy + 70 * s, 0), (cx - 38 * s, cy + 45 * s, 0),
                (cx - 25 * s, cy + 20 * s, 0), (cx - 8 * s, cy + 10 * s, 0)]

    for x in xs:
        finger = _finger_straight(x, knuckle_y, 22 * s) if fingers_open else _finger_curled(x, knuckle_y, 22 * s)
        pts += finger

    if rotate:
        pts = _rotate(pts, rotate, wrist[:2])
    return pts


def open_palm(**kw):
    return make_hand(True, "out", **kw)


def fist(**kw):
    return make_hand(False, "tucked", **kw)


def thumbs_up(**kw):
    return make_hand(False, "up", **kw)


# ---------------------------------------------------------------------------
# Classifier
# ---------------------------------------------------------------------------

class ClassifierTests(unittest.TestCase):
    def assertGesture(self, landmarks, expected):
        gesture, score, _ = classify_static(landmarks)
        self.assertEqual(gesture, expected)
        if expected == UNKNOWN:
            self.assertEqual(score, 0.0)
        else:
            self.assertGreater(score, 0.5)

    def test_open_palm_is_hello(self):
        self.assertGesture(open_palm(), HELLO)

    def test_open_palm_is_scale_and_rotation_tolerant(self):
        self.assertGesture(open_palm(rotate=25, scale=0.5), HELLO)
        self.assertGesture(open_palm(rotate=-30, scale=1.6), HELLO)

    def test_thumbs_up_is_yes(self):
        self.assertGesture(thumbs_up(), YES)
        self.assertGesture(thumbs_up(scale=0.6), YES)

    def test_fist_is_no(self):
        self.assertGesture(fist(), NO)
        self.assertGesture(fist(rotate=20, scale=0.7), NO)

    def test_unsupported_shape_is_unknown(self):
        # Curled fingers with the thumb sticking out sideways (not up).
        self.assertGesture(make_hand(False, "out"), UNKNOWN)

    def test_mirrored_hand_gives_same_result(self):
        mirrored = [(640 - x, y, z) for x, y, z in thumbs_up()]
        self.assertGesture(mirrored, YES)

    def test_features_report_open_palm_and_fingertips(self):
        features = extract_features(open_palm(center=(300, 300)))
        self.assertTrue(features.open_palm)
        self.assertEqual(features.extended_count, 4)
        x, y = features.fingertip_center
        self.assertAlmostEqual(x, 300, delta=1)
        self.assertLess(y, 300)  # fingertips above the knuckles

    def test_wrong_landmark_count_raises(self):
        with self.assertRaises(ValueError):
            classify_static([(0, 0, 0)] * 5)


# ---------------------------------------------------------------------------
# Smoothing, once-per-gesture events and THANK YOU
# ---------------------------------------------------------------------------

FACE = Face(chin=(320.0, 260.0), width=160.0, seen_at=0.0)
FRAME = 0.15  # seconds between frames (about 6-7 fps)


class Feeder:
    """Feeds frames into one session and records the events it emits."""

    def __init__(self):
        self.session = Session()
        self.t = 0.0
        self.events = []
        self.last = None

    def frames(self, gesture, count, open_palm=False, tips=(320.0, 420.0), face=FACE, scale=60.0):
        for _ in range(count):
            self.last = update_session(
                self.session, gesture, open_palm, tips, face, hand_scale=scale, now=self.t
            )
            if self.last["event"]:
                self.events.append(self.last["gesture"])
            self.t += FRAME
        return self.last

    def no_hand(self, count):
        return self.frames(UNKNOWN, count, tips=None, face=None)


class SmoothingTests(unittest.TestCase):
    def test_needs_three_matching_frames(self):
        f = Feeder()
        self.assertEqual(f.frames(YES, 1)["gesture"], UNKNOWN)
        self.assertEqual(f.frames(YES, 1)["gesture"], UNKNOWN)
        result = f.frames(YES, 1)
        self.assertEqual(result["gesture"], YES)
        self.assertTrue(result["stable"])

    def test_single_noisy_frame_does_not_change_result(self):
        f = Feeder()
        f.frames(YES, 4)
        self.assertEqual(f.frames(NO, 1)["gesture"], YES)


class EventTests(unittest.TestCase):
    def test_holding_a_gesture_emits_one_event(self):
        f = Feeder()
        f.frames(YES, 12)
        self.assertEqual(f.events, [YES])

    def test_switching_gesture_directly_emits_new_event(self):
        # Regression: YES -> NO without lowering the hand used to emit only YES.
        f = Feeder()
        f.frames(YES, 6)
        f.frames(NO, 6)
        self.assertEqual(f.events, [YES, NO])

    def test_same_gesture_again_after_neutral_hand(self):
        f = Feeder()
        f.frames(YES, 5)
        f.no_hand(8)  # > NEUTRAL_RESET_TIME of stable "Unknown"
        f.frames(YES, 5)
        self.assertEqual(f.events, [YES, YES])

    def test_brief_flicker_does_not_repeat_event(self):
        f = Feeder()
        f.frames(YES, 5)
        f.no_hand(2)
        f.frames(YES, 5)
        self.assertEqual(f.events, [YES])


class ThankYouTests(unittest.TestCase):
    def test_open_palm_at_chin_then_away_is_thank_you(self):
        f = Feeder()
        result = f.frames(HELLO, 3, open_palm=True, tips=(320, 262))
        self.assertNotEqual(result["gesture"], HELLO)
        self.assertEqual(result["pending"], THANK_YOU)

        f.frames(HELLO, 1, open_palm=True, tips=(330, 300))
        result = f.frames(HELLO, 1, open_palm=True, tips=(340, 380))
        self.assertEqual(result["gesture"], THANK_YOU)
        self.assertEqual(f.events, [THANK_YOU])

    def test_no_hello_event_after_thank_you(self):
        # Regression: the hand is still an open palm after THANK YOU and used to fire HELLO.
        f = Feeder()
        f.frames(HELLO, 3, open_palm=True, tips=(320, 262))
        f.frames(HELLO, 1, open_palm=True, tips=(340, 380))
        f.frames(HELLO, 15, open_palm=True, tips=(340, 390))
        self.assertEqual(f.events, [THANK_YOU])

    def test_moving_toward_camera_is_thank_you(self):
        f = Feeder()
        f.frames(HELLO, 1, open_palm=True, tips=(320, 262), scale=60)
        result = f.frames(HELLO, 1, open_palm=True, tips=(325, 270), scale=85)
        self.assertEqual(result["gesture"], THANK_YOU)

    def test_too_slow_is_not_thank_you(self):
        f = Feeder()
        f.frames(HELLO, 1, open_palm=True, tips=(320, 262))
        f.t += 3.0
        result = f.frames(HELLO, 1, open_palm=True, tips=(340, 400))
        self.assertNotEqual(result["gesture"], THANK_YOU)

    def test_open_palm_away_from_face_is_hello(self):
        f = Feeder()
        f.frames(HELLO, 3, open_palm=True, tips=(100, 120))
        self.assertEqual(f.events, [HELLO])

    def test_disabled_thank_you_reports_hello(self):
        session = Session()
        for i in range(3):
            result = update_session(
                session, HELLO, True, (320, 262), FACE, hand_scale=60, now=i * FRAME,
                thank_you_enabled=False,
            )
        self.assertEqual(result["gesture"], HELLO)


class SessionStoreTests(unittest.TestCase):
    def test_sessions_are_per_client_and_resettable(self):
        store = SessionStore(ttl=60)
        a = store.get("a")
        self.assertIs(store.get("a"), a)
        self.assertIsNot(store.get("b"), a)
        self.assertEqual(len(store), 2)
        store.reset("a")
        self.assertIsNot(store.get("a"), a)


# ---------------------------------------------------------------------------
# HTTP API
# ---------------------------------------------------------------------------

W, H = 640, 480


def _normalised(points):
    return [(x / W, y / H, z) for x, y, z in points]


def _jpeg() -> bytes:
    ok, buf = cv2.imencode(".jpg", np.zeros((H, W, 3), np.uint8))
    assert ok
    return buf.tobytes()


class FakeDetector:
    """Returns whatever DetectionResult the test puts in `next`."""

    def __init__(self):
        self.next = DetectionResult(hands=[], face=None, width=W, height=H)

    def hand(self, landmarks, face=None, score=0.95):
        self.next = DetectionResult(
            hands=[HandResult(_normalised(landmarks), "Right", score)], face=face, width=W, height=H
        )

    def detect(self, _image):
        return self.next

    def close(self):
        pass


def call(method, path, body=b"", headers=None):
    """Minimal ASGI client: returns (status, headers dict, parsed JSON or None)."""
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": ("127.0.0.1", 5000),
        "server": ("127.0.0.1", 8000),
    }
    sent = {"done": False}
    out = {"status": None, "headers": {}, "body": b""}

    async def receive():
        if sent["done"]:
            return {"type": "http.disconnect"}
        sent["done"] = True
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            out["status"] = message["status"]
            out["headers"] = {k.decode(): v.decode() for k, v in message["headers"]}
        elif message["type"] == "http.response.body":
            out["body"] += message.get("body", b"")

    asyncio.run(main.app(scope, receive, send))
    is_json = out["headers"].get("content-type", "").startswith("application/json")
    data = json.loads(out["body"]) if out["body"] and is_json else None
    return out["status"], out["headers"], data


def post_frame(jpeg: bytes, client_id="test-client"):
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"client_id\"\r\n\r\n{client_id}\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"frame\"; filename=\"f.jpg\"\r\n"
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode() + jpeg + f"\r\n--{boundary}--\r\n".encode()
    return call(
        "POST",
        "/api/gesture/recognize",
        body,
        {"content-type": f"multipart/form-data; boundary={boundary}", "content-length": str(len(body))},
    )


def post_json(path, payload):
    body = json.dumps(payload).encode()
    return call("POST", path, body, {"content-type": "application/json", "content-length": str(len(body))})


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.detector = FakeDetector()
        main.detector = self.detector
        main.sessions = main.SessionStore(ttl=60)
        self.jpeg = _jpeg()

    def tearDown(self):
        main.detector = None

    def test_health(self):
        status, _, data = call("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "ok")

    def test_supported_gestures(self):
        status, _, data = call("GET", "/api/gesture/supported")
        self.assertEqual(status, 200)
        names = [g["gesture"] for g in data["gestures"]]
        self.assertEqual(names, ["HELLO", "YES", "NO", "THANK YOU"])
        self.assertEqual(data["unknown_label"], "Unknown")

    def test_no_hand_returns_unknown(self):
        status, _, data = post_frame(self.jpeg)
        self.assertEqual(status, 200)
        self.assertEqual(data["gesture"], "Unknown")
        self.assertFalse(data["hand_detected"])
        self.assertEqual(data["confidence"], 0.0)

    def test_thumbs_up_becomes_yes_event_once(self):
        self.detector.hand(thumbs_up())
        results = [post_frame(self.jpeg)[2] for _ in range(5)]
        self.assertEqual([r["raw_gesture"] for r in results], ["YES"] * 5)
        self.assertEqual(results[-1]["gesture"], "YES")
        self.assertEqual(sum(r["event"] for r in results), 1)
        self.assertGreater(results[-1]["confidence"], 0.5)
        self.assertEqual(results[-1]["hand"]["handedness"], "Right")

    def test_clients_are_tracked_separately(self):
        self.detector.hand(fist())
        for _ in range(3):
            _, _, a = post_frame(self.jpeg, client_id="tab-a")
        _, _, b = post_frame(self.jpeg, client_id="tab-b")
        self.assertEqual(a["gesture"], "NO")
        self.assertEqual(b["gesture"], "Unknown")  # tab-b has only one frame so far

    def test_reset_clears_history(self):
        self.detector.hand(fist())
        for _ in range(3):
            post_frame(self.jpeg, client_id="tab-a")
        status, _, data = post_json("/api/gesture/reset", {"client_id": "tab-a"})
        self.assertEqual(status, 200)
        self.assertTrue(data["reset"])
        _, _, after = post_frame(self.jpeg, client_id="tab-a")
        self.assertEqual(after["gesture"], "Unknown")

    def test_thank_you_through_api(self):
        face = Face(chin=(320 / W, 250 / H), width=0.25, seen_at=0.0)
        # Fingertips at the chin (open_palm's fingertips sit 66 px above `center`)...
        self.detector.hand(open_palm(center=(320, 252 + 66)), face=face)
        for _ in range(3):
            _, _, data = post_frame(self.jpeg)
        self.assertEqual(data["pending"], "THANK YOU")
        # ...then moved down and away.
        self.detector.hand(open_palm(center=(340, 360 + 66)), face=face)
        _, _, data = post_frame(self.jpeg)
        self.assertEqual(data["gesture"], "THANK YOU")
        self.assertTrue(data["event"])

    def test_base64_endpoint(self):
        self.detector.hand(thumbs_up())
        image = "data:image/jpeg;base64," + base64.b64encode(self.jpeg).decode()
        status, _, data = post_json("/api/gesture/recognize-base64", {"image": image, "client_id": "b64"})
        self.assertEqual(status, 200)
        self.assertEqual(data["raw_gesture"], "YES")

    def test_invalid_image_is_400(self):
        status, _, data = post_frame(b"not an image")
        self.assertEqual(status, 400)
        self.assertIn("decode", data["detail"])

    def test_invalid_base64_is_400(self):
        status, _, _ = post_json("/api/gesture/recognize-base64", {"image": "@@@"})
        self.assertEqual(status, 400)

    def test_detector_not_ready_is_503(self):
        main.detector = None
        status, _, _ = post_frame(self.jpeg)
        self.assertEqual(status, 503)

    def test_cors_allows_vite_origin(self):
        status, headers, _ = call(
            "OPTIONS",
            "/api/gesture/recognize",
            headers={
                "origin": "http://localhost:5173",
                "access-control-request-method": "POST",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("access-control-allow-origin"), "http://localhost:5173")

    def test_cors_rejects_unknown_origin(self):
        status, headers, _ = call(
            "OPTIONS",
            "/api/gesture/recognize",
            headers={"origin": "http://evil.example", "access-control-request-method": "POST"},
        )
        self.assertEqual(status, 400)
        self.assertNotIn("access-control-allow-origin", headers)


if __name__ == "__main__":
    unittest.main()
