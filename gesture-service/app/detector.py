
"""MediaPipe wrapper: hand landmarks and face position for THANK YOU.

Uses the mediapipe.solutions API from MediaPipe 0.10.21.
Frames arrive as image bytes from the frontend; this file does not open a camera.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass

import cv2
import mediapipe as mp
import numpy as np

from . import config
from .session import Face


@dataclass
class HandResult:
    landmarks: list[tuple[float, float, float]]
    handedness: str
    score: float


@dataclass
class DetectionResult:
    hands: list[HandResult]
    face: Face | None
    width: int
    height: int


def decode_image(data: bytes) -> np.ndarray:
    """Decode JPEG/PNG/WebP bytes to a BGR image, downscaled if very large."""
    buffer = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)

    if image is None:
        raise ValueError("Could not decode image. Send a JPEG, PNG or WebP frame.")

    h, w = image.shape[:2]
    if w > config.MAX_FRAME_WIDTH:
        scale = config.MAX_FRAME_WIDTH / w
        image = cv2.resize(
            image,
            (config.MAX_FRAME_WIDTH, int(h * scale)),
            interpolation=cv2.INTER_AREA,
        )

    return image


class GestureDetector:
    """One shared MediaPipe Hands and FaceDetection graph."""

    def __init__(self) -> None:
        if not hasattr(mp, "solutions"):
            raise RuntimeError(
                "This MediaPipe build has no `mediapipe.solutions` API. "
                "Install mediapipe==0.10.21 in the gesture-service virtual environment."
            )

        self._lock = threading.Lock()

        self._hands = mp.solutions.hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            model_complexity=1,
            min_detection_confidence=config.MIN_DETECTION_CONFIDENCE,
            min_tracking_confidence=config.MIN_TRACKING_CONFIDENCE,
        )

        self._face = (
            mp.solutions.face_detection.FaceDetection(
                model_selection=0,
                min_detection_confidence=0.5,
            )
            if config.ENABLE_THANK_YOU
            else None
        )

    def close(self) -> None:
        self._hands.close()
        if self._face is not None:
            self._face.close()

    def detect(self, bgr: np.ndarray) -> DetectionResult:
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        h, w = rgb.shape[:2]

        with self._lock:
            hand_out = self._hands.process(rgb)
            face_out = self._face.process(rgb) if self._face is not None else None

        hands: list[HandResult] = []

        if hand_out.multi_hand_landmarks:
            for landmarks, handed in zip(
                hand_out.multi_hand_landmarks,
                hand_out.multi_handedness,
            ):
                classification = handed.classification[0]
                hands.append(
                    HandResult(
                        landmarks=[
                            (point.x, point.y, point.z)
                            for point in landmarks.landmark
                        ],
                        handedness=classification.label,
                        score=float(classification.score),
                    )
                )

        face = None

        if face_out is not None and face_out.detections:
            detection = max(
                face_out.detections,
                key=lambda item: item.score[0],
            )
            box = detection.location_data.relative_bounding_box
            keypoints = detection.location_data.relative_keypoints

            nose, mouth = keypoints[2], keypoints[3]

            # Estimate chin position from nose and mouth positions.
            chin_y = min(
                mouth.y + (mouth.y - nose.y) * 1.2,
                box.ymin + box.height,
            )

            face = Face(
                chin=(mouth.x, chin_y),
                width=box.width,
                seen_at=time.monotonic(),
            )

        return DetectionResult(
            hands=hands,
            face=face,
            width=w,
            height=h,
        )
