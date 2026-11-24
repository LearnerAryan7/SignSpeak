"""Service settings, overridable with environment variables."""
import os


def _list(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


CORS_ORIGINS = _list(
    os.getenv(
        "GESTURE_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
    )
)

MAX_FRAME_WIDTH = int(os.getenv("GESTURE_MAX_FRAME_WIDTH", "640"))
MAX_UPLOAD_BYTES = int(os.getenv("GESTURE_MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))

MIN_DETECTION_CONFIDENCE = float(os.getenv("GESTURE_MIN_DETECTION_CONFIDENCE", "0.6"))
MIN_TRACKING_CONFIDENCE = float(os.getenv("GESTURE_MIN_TRACKING_CONFIDENCE", "0.5"))

ENABLE_THANK_YOU = os.getenv("GESTURE_ENABLE_THANK_YOU", "1") not in ("0", "false", "False")

SESSION_TTL_SECONDS = float(os.getenv("GESTURE_SESSION_TTL", "60"))
