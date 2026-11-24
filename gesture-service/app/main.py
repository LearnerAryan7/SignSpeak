
"""FastAPI gesture recognition service."""
from __future__ import annotations

import base64
import binascii
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import config
from .classifier import HELLO, NO, THANK_YOU, UNKNOWN, YES, classify_static
from .detector import DetectionResult, GestureDetector, decode_image
from .session import Face, SessionStore, update_session

log = logging.getLogger("gesture-service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

SUPPORTED = [
    {"gesture": HELLO, "description": "Open palm, all fingers extended"},
    {"gesture": YES, "description": "Thumbs up"},
    {"gesture": NO, "description": "Closed fist"},
    {
        "gesture": THANK_YOU,
        "description": "Flat open hand at the chin, then moved away from the face",
        "enabled": config.ENABLE_THANK_YOU,
    },
]

sessions = SessionStore(ttl=config.SESSION_TTL_SECONDS)
detector: GestureDetector | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global detector
    log.info("Loading MediaPipe models...")
    detector = GestureDetector()
    log.info("Gesture service ready. CORS origins: %s", config.CORS_ORIGINS)
    yield
    detector.close()


app = FastAPI(
    title="Gesture Recognition Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class Base64Frame(BaseModel):
    image: str
    client_id: str = "default"


class ResetRequest(BaseModel):
    client_id: str = "default"


def _to_pixels(det: DetectionResult, xy: tuple[float, float]) -> tuple[float, float]:
    return xy[0] * det.width, xy[1] * det.height


def _recognize(image_bytes: bytes, client_id: str) -> dict:
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty frame.")

    if len(image_bytes) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Frame is too large.")

    started = time.perf_counter()

    try:
        image = decode_image(image_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if detector is None:
        raise HTTPException(status_code=503, detail="Detector is not ready.")

    det = detector.detect(image)
    session = sessions.get(client_id)

    face_px = None
    if det.face is not None:
        face_px = Face(
            chin=_to_pixels(det, det.face.chin),
            width=det.face.width * det.width,
            seen_at=det.face.seen_at,
        )

    raw_gesture = UNKNOWN
    rule_score = 0.0
    hand_info = None
    open_palm = False
    fingertips = None
    hand_scale = 0.0

    if det.hands:
        hand = det.hands[0]

        px_landmarks = [
            (x * det.width, y * det.height, z)
            for x, y, z in hand.landmarks
        ]

        raw_gesture, rule_score, features = classify_static(px_landmarks)

        open_palm = features.open_palm
        fingertips = features.fingertip_center
        hand_scale = features.palm_size

        hand_info = {
            "handedness": hand.handedness,
            "detection_score": round(hand.score, 3),
            **features.as_dict(),
        }

    state = update_session(
        session,
        raw_gesture=raw_gesture,
        open_palm=open_palm,
        fingertips=fingertips,
        face=face_px,
        hand_scale=hand_scale,
        thank_you_enabled=config.ENABLE_THANK_YOU,
    )

    gesture = state["gesture"]

    if gesture == THANK_YOU:
        confidence = 0.85
    elif gesture == UNKNOWN or not det.hands:
        confidence = 0.0
    else:
        confidence = rule_score * det.hands[0].score

    return {
        "gesture": gesture,
        "confidence": round(confidence, 3),
        "raw_gesture": raw_gesture,
        "stable": state["stable"],
        "event": state["event"],
        "pending": state["pending"],
        "hand_detected": bool(det.hands),
        "face_detected": det.face is not None,
        "hand": hand_info,
        "frame": {"width": det.width, "height": det.height},
        "processing_ms": round((time.perf_counter() - started) * 1000, 1),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok" if detector is not None else "starting",
        "thank_you_enabled": config.ENABLE_THANK_YOU,
        "active_sessions": len(sessions),
    }


@app.get("/api/gesture/supported")
def supported() -> dict:
    return {"gestures": SUPPORTED, "unknown_label": UNKNOWN}


@app.post("/api/gesture/recognize")
def recognize(
    frame: UploadFile = File(...),
    client_id: str = Form("default"),
) -> dict:
    return _recognize(frame.file.read(), client_id)


@app.post("/api/gesture/recognize-base64")
def recognize_base64(body: Base64Frame) -> dict:
    data = (
        body.image.split(",", 1)[1]
        if body.image.startswith("data:")
        else body.image
    )

    try:
        image_bytes = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid base64 image.",
        ) from exc

    return _recognize(image_bytes, body.client_id)


@app.post("/api/gesture/reset")
def reset(body: ResetRequest) -> dict:
    sessions.reset(body.client_id)
    return {"reset": True, "client_id": body.client_id}
