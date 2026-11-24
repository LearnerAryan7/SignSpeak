
import { useState, useEffect } from 'react';
import {
  Mic,
  Hand,
  FileText,
  Download,
  Trash2,
  UserPlus,
  Server,
  Video,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import CaptionsPanel from './components/CaptionsPanel';
import CaptionMessage from './components/CaptionMessage';
import WebcamPanel from './components/WebcamPanel';
import ControlPanel from './components/ControlPanel';
import StatsPanel from './components/StatsPanel';
import useMockRecognition, { speechSupported } from './hooks/useMockRecognition';
import { formatDuration } from './utils/formatTime';
import {
  downloadText,
  exportFileName,
  filterMessages,
  transcriptToCsv,
  transcriptToText,
} from './utils/transcript';

import './App.css';

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  classroom: 'Live Classroom',
  history: 'Transcripts',
  students: 'Students',
  settings: 'Settings',
  about: 'About',
};

const SPEECH_LANGUAGES = [
  { value: 'en-IN', label: 'English (India)' },
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'ta-IN', label: 'Tamil' },
  { value: 'te-IN', label: 'Telugu' },
  { value: 'kn-IN', label: 'Kannada' },
  { value: 'mr-IN', label: 'Marathi' },
  { value: 'bn-IN', label: 'Bengali' },
];

const DEFAULT_SETTINGS = {
  speechLanguage: 'en-IN',
  showInterim: true,
  autoCamera: true,
  mirrorPreview: true,
};

const COMMUNICATION_MODES = {
  sign: 'Sign language',
  speech: 'Speech',
  both: 'Sign and speech',
};

// Small localStorage helpers for settings and the student list.
function loadStored(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(`signspeak.${key}`));
    // Ignore missing or hand-edited values of the wrong shape.
    if (value == null || Array.isArray(value) !== Array.isArray(fallback) || typeof value !== typeof fallback) {
      return fallback;
    }
    return value;
  } catch {
    return fallback;
  }
}

function useStoredState(key, fallback) {
  const [value, setValue] = useState(() => loadStored(key, fallback));
  useEffect(() => {
    try {
      localStorage.setItem(`signspeak.${key}`, JSON.stringify(value));
    } catch {
      // storage unavailable: keep the value in memory only
    }
  }, [key, value]);
  return [value, setValue];
}

function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

function Notice({ tone = 'error', children }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

function DashboardPage({
  messages,
  speechCount,
  gestureCount,
  elapsed,
  isRunning,
  cameraOn,
  gestureService,
  studentCount,
  onNavigate,
}) {
  const recentMessages = [...messages].slice(-5).reverse();

  const serviceText = {
    online: 'Online',
    offline: 'Offline — start uvicorn on port 8000',
    unknown: 'Not checked yet (starts with recognition)',
  }[gestureService];

  return (
    <div className="page-view">
      <PageHeader
        title="Dashboard"
        subtitle="Sign Language & Speech-to-Text Classroom Assistant"
      >
        <button type="button" className="btn btn--primary" onClick={() => onNavigate('classroom')}>
          Open Live Classroom
          <ArrowRight size={16} />
        </button>
      </PageHeader>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <h3>Total captions</h3>
          <strong>{messages.length}</strong>
          <p>{speechCount} speech · {gestureCount} sign gesture</p>
        </div>
        <div className="dashboard-card">
          <h3>Session time</h3>
          <strong>{formatDuration(elapsed)}</strong>
          <p>{isRunning ? 'Recognition is running' : 'Recognition is stopped'}</p>
        </div>
        <div className="dashboard-card">
          <h3>Students</h3>
          <strong>{studentCount}</strong>
          <p>
            <button type="button" className="link-button" onClick={() => onNavigate('students')}>
              Manage students
            </button>
          </p>
        </div>
      </div>

      <div className="dashboard-columns">
        <section className="page-panel">
          <div className="page-panel-header">
            <h2>System status</h2>
          </div>
          <div className="status-rows">
            <div className="settings-row">
              <div>
                <h3><Mic size={15} /> Speech recognition</h3>
                <p>{speechSupported ? 'Supported in this browser (Web Speech API)' : 'Not supported — use Chrome or Edge'}</p>
              </div>
              <span className={`page-badge ${speechSupported ? '' : 'page-badge--warn'}`}>
                {speechSupported ? (isRunning ? 'Listening' : 'Ready') : 'Unavailable'}
              </span>
            </div>
            <div className="settings-row">
              <div>
                <h3><Video size={15} /> Webcam</h3>
                <p>Needed for sign gesture recognition</p>
              </div>
              <span className={`page-badge ${cameraOn ? '' : 'page-badge--muted'}`}>
                {cameraOn ? 'On' : 'Off'}
              </span>
            </div>
            <div className="settings-row">
              <div>
                <h3><Server size={15} /> Gesture service</h3>
                <p>{serviceText}</p>
              </div>
              <span
                className={`page-badge ${
                  gestureService === 'online' ? '' : gestureService === 'offline' ? 'page-badge--warn' : 'page-badge--muted'
                }`}
              >
                {gestureService === 'online' ? 'Online' : gestureService === 'offline' ? 'Offline' : 'Unknown'}
              </span>
            </div>
          </div>
        </section>

        <section className="page-panel">
          <div className="page-panel-header">
            <h2>Recent captions</h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onNavigate('history')}>
              View all transcripts
            </button>
          </div>
          {recentMessages.length === 0 ? (
            <div className="empty-state">
              <h3>No captions yet</h3>
              <p>Start a session in Live Classroom to see speech and sign gesture captions here.</p>
            </div>
          ) : (
            <div className="recent-list">
              {recentMessages.map((message) => (
                <CaptionMessage key={message.id} message={message} index={messages.indexOf(message)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function HistoryPage({ messages, onClear }) {
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');

  const visible = filterMessages(messages, { type, query });
  const sortedMessages = [...visible].reverse();

  const exportAs = (format) => {
    if (format === 'csv') {
      downloadText(exportFileName('csv'), transcriptToCsv(messages), 'text/csv');
    } else {
      downloadText(exportFileName('txt'), transcriptToText(messages));
    }
  };

  return (
    <div className="page-view">
      <PageHeader title="Transcripts" subtitle="Captured speech and sign language messages">
        <button type="button" className="btn btn--ghost" onClick={() => exportAs('txt')} disabled={!messages.length}>
          <Download size={16} /> Export TXT
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => exportAs('csv')} disabled={!messages.length}>
          <FileText size={16} /> Export CSV
        </button>
      </PageHeader>

      <section className="page-panel">
        <div className="page-panel-header">
          <h2>Session transcript</h2>
          <div className="toolbar">
            <div className="segmented" role="group" aria-label="Filter by type">
              {[
                ['all', `All (${messages.length})`],
                ['speech', 'Speech'],
                ['gesture', 'Sign gesture'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={type === value ? 'segmented-active' : ''}
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="input"
              placeholder="Search transcript…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search transcript"
            />
          </div>
        </div>

        {sortedMessages.length === 0 ? (
          <div className="empty-state">
            <h3>{messages.length ? 'No matching messages' : 'No transcripts available'}</h3>
            <p>
              {messages.length
                ? 'Try another search or filter.'
                : 'Start recognition in Live Classroom to capture messages.'}
            </p>
          </div>
        ) : (
          <div className="history-list">
            {sortedMessages.map((message) => (
              <div key={message.id} className="history-item">
                <div>
                  <span className={`type-badge type-badge--${message.type}`}>
                    {message.type === 'speech' ? 'SPEECH' : 'SIGN GESTURE'}
                  </span>
                  <p className="history-text">{message.text}</p>
                </div>
                <small className="history-meta">
                  {new Date(message.timestamp).toLocaleTimeString()}
                  {message.confidence ? ` · ${Math.round(message.confidence * 100)}%` : ''}
                </small>
              </div>
            ))}
          </div>
        )}
      </section>

      {messages.length > 0 && (
        <div className="page-footer-actions">
          <button type="button" className="btn btn--ghost" onClick={onClear}>
            <Trash2 size={16} /> Clear transcript
          </button>
        </div>
      )}
    </div>
  );
}

function StudentsPage({ students, onAdd, onRemove }) {
  const [form, setForm] = useState({ name: '', rollNumber: '', communication: 'sign' });
  const [error, setError] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const rollNumber = form.rollNumber.trim();
    if (!name) {
      setError('Enter the student’s name.');
      return;
    }
    if (rollNumber && students.some((s) => s.rollNumber.toLowerCase() === rollNumber.toLowerCase())) {
      setError(`Roll number ${rollNumber} is already used.`);
      return;
    }
    onAdd({ id: `student-${Date.now()}`, name, rollNumber, communication: form.communication });
    setForm({ name: '', rollNumber: '', communication: form.communication });
    setError('');
  };

  return (
    <div className="page-view">
      <PageHeader title="Students" subtitle="Classroom student management" />

      <section className="page-panel">
        <div className="page-panel-header">
          <h2>Add student</h2>
        </div>
        <form className="student-form" onSubmit={submit}>
          <label className="field">
            <span>Name</span>
            <input
              className="input"
              value={form.name}
              maxLength={60}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Aarav Kumar"
            />
          </label>
          <label className="field">
            <span>Roll number</span>
            <input
              className="input"
              value={form.rollNumber}
              maxLength={20}
              onChange={(event) => setForm({ ...form, rollNumber: event.target.value })}
              placeholder="Optional"
            />
          </label>
          <label className="field">
            <span>Communication</span>
            <select
              className="input"
              value={form.communication}
              onChange={(event) => setForm({ ...form, communication: event.target.value })}
            >
              {Object.entries(COMMUNICATION_MODES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn--primary">
            <UserPlus size={16} /> Add student
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}
      </section>

      <section className="page-panel">
        <div className="page-panel-header">
          <h2>Class list</h2>
          <span className="page-badge">{students.length} students</span>
        </div>
        {students.length === 0 ? (
          <div className="empty-state">
            <h3>No students have been added yet</h3>
            <p>Add students above. The list is saved in this browser.</p>
          </div>
        ) : (
          <div className="page-list">
            {students.map((student) => (
              <div key={student.id} className="page-list-item">
                <div className="student-row">
                  <span className="user-avatar">
                    {student.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <div>
                    <strong>{student.name}</strong>
                    <p>
                      {student.rollNumber ? `Roll no. ${student.rollNumber} · ` : ''}
                      {COMMUNICATION_MODES[student.communication] ?? COMMUNICATION_MODES.sign}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => onRemove(student.id)}
                  aria-label={`Remove ${student.name}`}
                >
                  <Trash2 size={15} /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SettingsPage({ settings, onChange, onReset }) {
  const toggle = (key) => (
    <input
      type="checkbox"
      className="switch"
      checked={settings[key]}
      onChange={(event) => onChange(key, event.target.checked)}
    />
  );

  return (
    <div className="page-view">
      <PageHeader title="Settings" subtitle="Application preferences (saved in this browser)">
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          <RotateCcw size={16} /> Reset to defaults
        </button>
      </PageHeader>

      <section className="page-panel">
        <div className="page-panel-header">
          <h2>Speech recognition</h2>
        </div>
        <label className="settings-row">
          <div>
            <h3>Speech language</h3>
            <p>Language used by the browser Web Speech API. Changes apply immediately.</p>
          </div>
          <select
            className="input"
            value={settings.speechLanguage}
            onChange={(event) => onChange('speechLanguage', event.target.value)}
          >
            {SPEECH_LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>{language.label}</option>
            ))}
          </select>
        </label>
        <label className="settings-row">
          <div>
            <h3>Show words while speaking</h3>
            <p>Display the phrase being spoken before it is final.</p>
          </div>
          {toggle('showInterim')}
        </label>
      </section>

      <section className="page-panel">
        <div className="page-panel-header">
          <h2>Webcam and gestures</h2>
        </div>
        <label className="settings-row">
          <div>
            <h3>Turn on webcam with recognition</h3>
            <p>Start Recognition also switches the camera on, so sign gestures are recognised.</p>
          </div>
          {toggle('autoCamera')}
        </label>
        <label className="settings-row">
          <div>
            <h3>Mirror webcam preview</h3>
            <p>Show the preview like a mirror. Frames sent for recognition are not affected.</p>
          </div>
          {toggle('mirrorPreview')}
        </label>
        <div className="settings-row">
          <div>
            <h3>Gesture service</h3>
            <p>Python FastAPI + MediaPipe at http://127.0.0.1:8000</p>
          </div>
          <span className="page-badge">HELLO · YES · NO · THANK YOU</span>
        </div>
      </section>
    </div>
  );
}

function AboutPage() {
  const features = [
    ['Real-time speech-to-text', 'The teacher’s speech is captioned live with the browser Web Speech API.'],
    ['Sign gesture recognition', 'MediaPipe hand landmarks are classified into HELLO, YES, NO and THANK YOU.'],
    ['Combined classroom captions', 'Speech and sign messages appear in one transcript with clear labels.'],
    ['Transcripts and export', 'Search, filter and download the session as TXT or CSV.'],
  ];
  const gestures = [
    ['HELLO', 'Open palm, all fingers straight, away from the face'],
    ['YES', 'Thumbs up, other fingers curled'],
    ['NO', 'Closed fist with the thumb tucked in'],
    ['THANK YOU', 'Flat hand with fingertips at the chin, then moved forward or down'],
  ];

  return (
    <div className="page-view">
      <PageHeader title="About" subtitle="Project information" />

      <div className="about-hero">
        <h2>Sign Language & Speech-to-Text Classroom Assistant</h2>
        <p>
          An assistive classroom communication system that combines spoken language
          recognition with static sign gesture recognition, so deaf, hard-of-hearing and
          hearing students can follow the same lesson in real time.
        </p>
      </div>

      <section className="page-panel">
        <div className="page-panel-header">
          <h2>Key features</h2>
        </div>
        <div className="page-panel-body feature-grid">
          {features.map(([title, text]) => (
            <div key={title} className="feature-card">
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="page-panel">
        <div className="page-panel-header">
          <h2>Supported gestures</h2>
        </div>
        <div className="page-list">
          {gestures.map(([label, how]) => (
            <div key={label} className="page-list-item">
              <span className="gesture-gloss"><Hand size={13} /> {label}</span>
              <p>{how}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="page-panel">
        <div className="page-panel-header">
          <h2>Technology stack</h2>
        </div>
        <div className="page-panel-body tech-grid">
          <div className="tech-card">
            <h3>Frontend</h3>
            <p>React · Vite · Web Speech API · getUserMedia · Lucide icons</p>
          </div>
          <div className="tech-card">
            <h3>Gesture service</h3>
            <p>Python · FastAPI · OpenCV · MediaPipe Hands and Face Detection</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [activeNav, setActiveNav] = useState('classroom');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [settings, setSettings] = useStoredState('settings', DEFAULT_SETTINGS);
  const [storedStudents, setStudents] = useStoredState('students', []);
  const students = storedStudents.filter((s) => s && typeof s.name === 'string' && s.id);

  const options = { ...DEFAULT_SETTINGS, ...settings };

  const {
    isRunning,
    messages,
    pending,
    interim,
    elapsed,
    speechCount,
    gestureCount,
    speechError,
    gestureService,
    handDetected,
    start,
    stop,
    clear,
  } = useMockRecognition(cameraStream, { language: options.speechLanguage });

  useEffect(() => {
    document.title = `${PAGE_TITLES[activeNav] ?? 'Dashboard'} · SignSpeak`;
  }, [activeNav]);

  useEffect(() => {
    if (!cameraOn) return;

    let cancelled = false;
    let stream;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Camera access is not supported in this browser.'
          );
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        setCameraError(null);
        setCameraStream(stream);
      } catch (error) {
        console.error('Camera error:', error);

        if (!cancelled) {
          setCameraOn(false);
          setCameraError(
            error.name === 'NotAllowedError'
              ? 'Camera permission was denied. Allow camera access for this site and turn the webcam on again.'
              : `Could not access camera: ${error.message}`
          );
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setCameraStream(null);
    };
  }, [cameraOn]);

  const handleStart = () => {
    if (options.autoCamera) setCameraOn(true);
    start();
  };

  const updateSetting = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  const renderPage = () => {
    switch (activeNav) {
      case 'dashboard':
        return (
          <DashboardPage
            messages={messages}
            speechCount={speechCount}
            gestureCount={gestureCount}
            elapsed={elapsed}
            isRunning={isRunning}
            cameraOn={cameraOn}
            gestureService={gestureService}
            studentCount={students.length}
            onNavigate={setActiveNav}
          />
        );

      case 'classroom':
        return (
          <>
            <div className="workspace-header">
              <div>
                <h1 className="workspace-title">Live Classroom</h1>
                <p className="workspace-subtitle">
                  Science · Grade 6 · The Water Cycle
                </p>
              </div>

              <ControlPanel
                isRunning={isRunning}
                hasMessages={messages.length > 0}
                onStart={handleStart}
                onStop={stop}
                onClear={clear}
              />
            </div>

            {speechError && <Notice>{speechError}</Notice>}
            {cameraError && <Notice>{cameraError}</Notice>}
            {isRunning && cameraOn && gestureService === 'offline' && (
              <Notice tone="warning">
                The gesture service is not reachable. Start it with{' '}
                <code>uvicorn app.main:app --port 8000</code> in the gesture-service folder.
              </Notice>
            )}
            {isRunning && !cameraOn && (
              <Notice tone="info">
                The webcam is off, so only speech is captioned. Turn the webcam on in the top bar
                to recognise sign gestures.
              </Notice>
            )}

            <div className="workspace-grid">
              <CaptionsPanel
                messages={messages}
                pending={pending}
                interim={options.showInterim ? interim : ''}
                isRunning={isRunning}
              />

              <aside className="side-column">
                <WebcamPanel
                  cameraOn={cameraOn}
                  cameraStream={cameraStream}
                  mirror={options.mirrorPreview}
                  isRunning={isRunning}
                  handDetected={handDetected}
                  gestureService={gestureService}
                />

                <StatsPanel
                  total={messages.length}
                  speechCount={speechCount}
                  gestureCount={gestureCount}
                  isRunning={isRunning}
                />
              </aside>
            </div>
          </>
        );

      case 'history':
        return <HistoryPage messages={messages} onClear={clear} />;

      case 'students':
        return (
          <StudentsPage
            students={students}
            onAdd={(student) => setStudents((list) => [...list, student])}
            onRemove={(id) => setStudents((list) => list.filter((s) => s.id !== id))}
          />
        );

      case 'settings':
        return (
          <SettingsPage
            settings={options}
            onChange={updateSetting}
            onReset={() => setSettings(DEFAULT_SETTINGS)}
          />
        );

      case 'about':
        return <AboutPage />;

      default:
        return <DashboardPage
          messages={messages}
          speechCount={speechCount}
          gestureCount={gestureCount}
          elapsed={elapsed}
          isRunning={isRunning}
          cameraOn={cameraOn}
          gestureService={gestureService}
          studentCount={students.length}
          onNavigate={setActiveNav}
        />;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        active={activeNav}
        onNavigate={setActiveNav}
      />

      <div className="app-main">
        <TopBar
          isRunning={isRunning}
          elapsed={elapsed}
          cameraOn={cameraOn}
          onToggleCamera={() => {
            setCameraError(null);
            setCameraOn((value) => !value);
          }}
        />

        <main className="workspace">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
