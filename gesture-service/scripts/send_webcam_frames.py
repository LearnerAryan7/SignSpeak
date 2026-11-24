
"""Test the running API with your webcam. Ctrl+C to stop."""
import argparse
import json
import time
import urllib.error
import urllib.request
import uuid

import cv2


def post_frame(url: str, jpeg: bytes, client_id: str) -> dict:
    boundary = uuid.uuid4().hex

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="client_id"\r\n\r\n'
        f"{client_id}\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="frame"; filename="frame.jpg"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode() + jpeg + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}"
        },
    )

    with urllib.request.urlopen(req, timeout=10) as response:
        return json.loads(response.read())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:8000/api/gesture/recognize",
    )
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--fps", type=float, default=6.0)
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.camera)

    if not cap.isOpened():
        raise SystemExit(
            "Could not open webcam. Check camera permissions."
        )

    client_id = f"cli-{uuid.uuid4().hex[:8]}"
    interval = 1.0 / args.fps
    last = None

    print(f"Sending frames to {args.url}. Ctrl+C to stop.")

    try:
        while True:
            started = time.time()

            ok, frame = cap.read()
            if not ok:
                continue

            ok, jpeg = cv2.imencode(
                ".jpg",
                frame,
                [cv2.IMWRITE_JPEG_QUALITY, 75],
            )

            if not ok:
                continue

            try:
                result = post_frame(
                    args.url,
                    jpeg.tobytes(),
                    client_id,
                )
            except urllib.error.URLError as exc:
                raise SystemExit(
                    f"API not reachable: {exc}. Is uvicorn running?"
                )

            line = (
                f"{result['gesture']:<10} "
                f"conf={result['confidence']:.2f} "
                f"raw={result['raw_gesture']:<10} "
                f"hand={result['hand_detected']} "
                f"face={result['face_detected']} "
                f"pending={result['pending']}"
            )

            if line != last:
                print(line)
                last = line

            time.sleep(
                max(0.0, interval - (time.time() - started))
            )

    except KeyboardInterrupt:
        print("\nWebcam test stopped.")

    finally:
        cap.release()


if __name__ == "__main__":
    main()
