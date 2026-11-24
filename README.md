# SignSpeak — Sign Language & Speech-to-Text Classroom Assistant

A classroom accessibility dashboard that turns the teacher's **speech** and students'
**sign gestures** into one live caption stream.

- **Speech → text:** the browser Web Speech API (Chrome or Edge).
- **Sign gestures → text:** the webcam image is sent to a Python service
  (FastAPI + MediaPipe Hands). It recognises **HELLO**, **YES**, **NO** and **THANK YOU**.
- **Pages:** Dashboard, Live Classroom, Transcripts, Students, Settings and About.

```
SignLanguageSpeechToText/
├── frontend/          React + Vite dashboard (port 5173)
└── gesture-service/   Python FastAPI gesture recognition API (port 8000)
```

---

## 1. Requirements

| Tool | Version |
|---|---|
| macOS (tested), Windows or Linux | — |
| Node.js | 20.19+ or 22.12+ (required by Vite 8) |
| Python | 3.11 |
| Browser | Google Chrome or Microsoft Edge (Web Speech API) |

## 2. Install

### Gesture service

```bash
cd gesture-service
python3.11 -m venv venv
source venv/bin/activate              # Windows: venv\Scripts\activate
pip install mediapipe==0.10.21        # also installs OpenCV and NumPy
pip install -r requirements.txt       # FastAPI, Uvicorn, python-multipart
```

> Keep **mediapipe 0.10.21**. Version 0.10.22 and later removed the
> `mediapipe.solutions` API that this service uses.

### Frontend

```bash
cd frontend
npm install
```

## 3. Run

Use two terminals.

```bash
# Terminal 1 — gesture service
cd gesture-service
source venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
# Terminal 2 — frontend
cd frontend
npm run dev
```

Open **http://localhost:5173** in Chrome, go to **Live Classroom** and click
**Start Recognition**. Allow microphone and camera access when the browser asks.

## 4. Using the app

| Page | What it does |
|---|---|
| **Dashboard** | Caption counts, session time, student count, the status of speech, webcam and gesture service, and the latest captions. |
| **Live Classroom** | Start/Stop Recognition, the live captions (blue **SPEECH**, orange **SIGN GESTURE**), the webcam preview and transcript statistics. While you speak, the words appear before the phrase is final. |
| **Transcripts** | The whole session, filtered by type, searchable, and exportable as **TXT** or **CSV**. |
| **Students** | Add and remove students (name, roll number, communication mode). |
| **Settings** | Speech language, live (interim) words, turn on the webcam with recognition, mirror the preview. |
| **About** | Project summary, supported gestures and technology stack. |

The webcam button in the top bar turns the camera on or off at any time.
If speech recognition is unavailable (for example in Safari or Firefox), sign
gestures still work.

**Saved in the browser (localStorage):** the current transcript (it survives a
page reload until you click **Clear Transcript**), settings and the student list.
Nothing is sent anywhere except webcam frames to your local gesture service and
audio to the browser's speech service.

### Signing the gestures

| Gesture | How |
|---|---|
| HELLO | Open palm, all fingers straight, away from the face |
| YES | Thumbs up, other fingers curled |
| NO | Closed fist, thumb tucked in |
| THANK YOU | Flat hand with fingertips at the chin, then move it forward or down within about 2 s |

Each gesture adds **one** caption. Holding it does not repeat it. Lower your hand (or
switch to another gesture) to sign again.

## 5. Tests

```bash
# Gesture service: 34 tests (classifier, smoothing/events, THANK YOU, HTTP API, CORS)
cd gesture-service && source venv/bin/activate
python -m unittest discover -s tests -v

# Frontend: unit tests for transcript filtering/export and time formatting
cd frontend
npm test
npm run lint
npm run build
```

The Python tests need no camera and no extra packages. They use synthetic hand
landmarks and a fake detector.

### Manual test checklist

1. `curl http://127.0.0.1:8000/health` returns `{"status":"ok", ...}`.
2. Start Recognition, then speak. The words appear in italics while you speak, then a blue **SPEECH** caption is added.
3. Open palm away from your face gives one **HELLO**. Holding it adds nothing more.
4. Thumbs up, then fist, without lowering your hand, gives **YES** then **NO**.
5. Flat hand at the chin, moved forward, gives **THANK YOU** and no extra HELLO.
6. Stop uvicorn while running. The classroom shows a warning and the dashboard
   shows **Offline**. Start it again and recognition continues.
7. Reload the page. The transcript is still there. **Clear Transcript** empties it.
8. Transcripts → **Export CSV** downloads a file that opens in Excel/Numbers.

## 6. Gesture service API

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/health` | — | Service status |
| GET | `/api/gesture/supported` | — | Supported gestures |
| POST | `/api/gesture/recognize` | multipart: `frame` (JPEG/PNG), `client_id` | Recognise one frame |
| POST | `/api/gesture/recognize-base64` | JSON `{"image": "data:image/jpeg;base64,...", "client_id": "..."}` | Same, base64 |
| POST | `/api/gesture/reset` | JSON `{"client_id": "..."}` | Clear motion history |

Example response:

```json
{
  "gesture": "YES", "confidence": 0.92, "raw_gesture": "YES",
  "stable": true, "event": true, "pending": null,
  "hand_detected": true, "face_detected": true,
  "hand": {"handedness": "Right", "detection_score": 0.97, "fingers_extended": {"index": false, "middle": false, "ring": false, "pinky": false}, "thumb_extended": true, "thumb_up": true},
  "frame": {"width": 640, "height": 480}, "processing_ms": 21.4,
  "timestamp": "2026-11-24T09:40:12.123456+00:00"
}
```

- `gesture`: smoothed result. 3 of the last 5 frames must agree.
- `event`: `true` on the one frame that should become a caption.
- `pending`: `"THANK YOU"` while an open palm is held at the chin.

Settings (environment variables): `GESTURE_CORS_ORIGINS`, `GESTURE_ENABLE_THANK_YOU`,
`GESTURE_MAX_FRAME_WIDTH`, `GESTURE_MIN_DETECTION_CONFIDENCE`,
`GESTURE_MIN_TRACKING_CONFIDENCE`, `GESTURE_SESSION_TTL` (see `gesture-service/app/config.py`).

Headless webcam test without the React app:
`python scripts/send_webcam_frames.py --fps 6`. Stop it before using the browser,
so the camera is free.

## 7. How it works

```
Browser (React)                                   Python (FastAPI)
────────────────                                  ─────────────────
Microphone ─▶ Web Speech API ─▶ SPEECH caption
Webcam ─▶ <canvas> JPEG every 300 ms ─POST─▶ /api/gesture/recognize
                                                  MediaPipe Hands → 21 landmarks
                                                  classifier.py  → HELLO / YES / NO
                                                  session.py     → smoothing, THANK YOU
                                                                    motion, once-per-gesture
SIGN GESTURE caption ◀───────────── JSON {gesture, event, ...}
```

| File | Role |
|---|---|
| `frontend/src/App.jsx` | Page routing, the six pages, camera, settings and students |
| `frontend/src/hooks/useMockRecognition.js` | Speech recognition, gesture frame loop, transcript, session timer |
| `frontend/src/components/*` | Sidebar, top bar, captions, webcam, controls, statistics |
| `frontend/src/utils/transcript.js` | Transcript filter and TXT/CSV export |
| `gesture-service/app/main.py` | FastAPI app, CORS, endpoints |
| `gesture-service/app/detector.py` | MediaPipe Hands + Face Detection |
| `gesture-service/app/classifier.py` | Rules for HELLO / YES / NO |
| `gesture-service/app/session.py` | Per-tab smoothing, events and THANK YOU tracking |

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| "Speech recognition is not supported" | Use Chrome or Edge. Sign gestures still work in other browsers. |
| "Speech recognition needs an internet connection" | Chrome's speech service is online-only. Check the network. |
| Microphone/camera permission denied | Click the camera icon in Chrome's address bar, allow access, then start again. |
| "Gesture service offline" | Start uvicorn (section 3). Check `curl http://127.0.0.1:8000/health`. |
| Camera "in use by another app" | Stop `send_webcam_frames.py` or any other app using the webcam. |
| `AttributeError: module 'mediapipe' has no attribute 'solutions'` | `pip install mediapipe==0.10.21` |
| CORS error in the browser console | Open the app at `http://localhost:5173` or `http://127.0.0.1:5173`, or set `GESTURE_CORS_ORIGINS`. |
| Gestures recognised poorly | Use good, even lighting. Keep one hand clearly in the frame, about 50–80 cm from the camera. |
