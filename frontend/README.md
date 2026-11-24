# SignSpeak frontend

React 19 + Vite 8 dashboard for the Sign Language & Speech-to-Text Classroom Assistant.
See the [project README](../README.md) for setup of both parts, usage and troubleshooting.

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # unit tests (Node's built-in test runner)
npm run lint      # ESLint, including React hooks rules
npm run build     # production build in dist/
```

The gesture service must be running at `http://127.0.0.1:8000` for sign gestures
(`GESTURE_API` in `src/hooks/useMockRecognition.js`). Speech recognition needs Chrome or Edge.

## Structure

```
src/
├── App.jsx                     page routing, the six pages, camera, settings, students
├── App.css / index.css         layout, components and page styles
├── hooks/useMockRecognition.js speech recognition, gesture frame loop, transcript, timer
├── components/                 Sidebar, TopBar, CaptionsPanel, CaptionMessage,
│                               WebcamPanel, ControlPanel, StatsPanel, StatusIndicator
├── utils/formatTime.js         time formatting
├── utils/transcript.js         transcript filter + TXT/CSV export
├── utils/transcript.test.js    unit tests
└── data/mockEvents.js          sample events (not used at runtime)
```

Data kept in `localStorage`: `signspeak.transcript`, `signspeak.settings`, `signspeak.students`.
