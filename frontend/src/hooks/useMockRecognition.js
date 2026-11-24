
import { useCallback, useEffect, useRef, useState } from 'react';

const GESTURE_API =
  'http://127.0.0.1:8000/api/gesture/recognize';

const KNOWN_GESTURES = new Set([
  'HELLO',
  'YES',
  'NO',
  'THANK YOU',
]);

const SpeechRecognitionImpl =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined;

export const speechSupported = Boolean(SpeechRecognitionImpl);

// One id per browser tab so the gesture service can follow hand movement.
const CLIENT_ID =
  globalThis.crypto?.randomUUID?.() ||
  `classroom-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const STORAGE_KEY = 'signspeak.transcript';

const SPEECH_ERRORS = {
  'not-allowed':
    'Microphone permission was denied. Allow microphone access for this site and start recognition again.',
  'service-not-allowed':
    'The browser blocked the speech service. Allow microphone access for this site and try again.',
  'audio-capture':
    'No microphone was found. Connect a microphone and start recognition again.',
  'language-not-supported':
    'The selected speech language is not supported by this browser. Choose another language in Settings.',
};

// Restore the transcript saved before a page reload.
function loadMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved)
      ? saved
          .filter((m) => m && (m.type === 'speech' || m.type === 'gesture') && typeof m.text === 'string')
          .map((m) => ({ ...m, timestamp: new Date(m.timestamp) }))
      : [];
  } catch {
    return [];
  }
}

export default function useMockRecognition(cameraStream, { language = 'en-IN' } = {}) {
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState(loadMessages);
  const [interim, setInterim] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [speechError, setSpeechError] = useState(null);
  const [gestureService, setGestureService] = useState('unknown'); // 'unknown' | 'online' | 'offline'
  const [handDetected, setHandDetected] = useState(false);

  const recognitionRef = useRef(null);
  const idRef = useRef(messages.reduce((max, m) => Math.max(max, Number(m.id) || 0), 0));
  const shouldRunRef = useRef(false);

  // Keep the transcript across page reloads.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // storage full or unavailable: the transcript still works in memory
    }
  }, [messages]);

  // Add a new transcript message
  const addMessage = useCallback((type, text, confidence = 0) => {
    idRef.current += 1;
    const id = idRef.current;

    setMessages((previous) => [
      ...previous,
      {
        id,
        type,
        text,
        confidence,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // -----------------------------------------
  // SPEECH RECOGNITION
  // -----------------------------------------

  useEffect(() => {
    if (!isRunning || !SpeechRecognitionImpl) {
      shouldRunRef.current = false;
      return;
    }

    shouldRunRef.current = true;
    let failures = 0;
    let timerId;

    const recognition = new SpeechRecognitionImpl();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    const startRecognition = () => {
      if (!shouldRunRef.current) return;
      try {
        recognition.start();
      } catch (error) {
        console.warn('Speech recognition start:', error);
      }
    };

    recognition.onstart = () => {
      setSpeechError(null);
    };

    recognition.onresult = (event) => {
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();

        if (result.isFinal && transcript) {
          addMessage(
            'speech',
            transcript,
            result[0].confidence || 0
          );
        } else if (transcript) {
          interimText += (interimText ? ' ' : '') + transcript;
        }
      }

      failures = 0;
      setInterim(interimText);
    };

    recognition.onerror = (event) => {
      // Silence and our own abort are normal; onend restarts recognition.
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      console.error('Speech recognition error:', event.error);

      if (SPEECH_ERRORS[event.error]) {
        shouldRunRef.current = false;
        setSpeechError(SPEECH_ERRORS[event.error]);
        setIsRunning(false);
        return;
      }

      failures += 1;
      setSpeechError(
        event.error === 'network'
          ? 'Speech recognition needs an internet connection. Retrying…'
          : `Speech recognition error (${event.error}). Retrying…`
      );
    };

    recognition.onend = () => {
      setInterim('');
      if (shouldRunRef.current) {
        // Chrome stops after a pause; restart, backing off if it keeps failing.
        timerId = setTimeout(startRecognition, failures ? Math.min(1000 * failures, 5000) : 150);
      }
    };

    timerId = setTimeout(startRecognition, 0);

    return () => {
      shouldRunRef.current = false;
      clearTimeout(timerId);

      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;

      try {
        recognition.stop();
      } catch (error) {
        console.warn(error);
      }

      recognitionRef.current = null;
      setInterim('');
    };
  }, [isRunning, language, addMessage]);

  // -----------------------------------------
  // GESTURE RECOGNITION
  // -----------------------------------------

  useEffect(() => {
    if (!isRunning || !cameraStream) {
      return;
    }

    let cancelled = false;
    let timeoutId;
    let video;
    let canvas;

    async function startGestureDetection() {
      video = document.createElement('video');
      video.srcObject = cameraStream;
      video.muted = true;
      video.playsInline = true;

      canvas = document.createElement('canvas');

      try {
        await video.play();
      } catch (error) {
        console.error(
          'Gesture video playback error:',
          error
        );
        return;
      }

      if (cancelled) return;

      canvas.width = 640;
      canvas.height = 480;

      const context = canvas.getContext('2d');

      // Start each session with a fresh server-side motion history.
      try {
        await fetch(GESTURE_API.replace('/recognize', '/reset'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: CLIENT_ID }),
        });
      } catch {
        // reported by the first frame request below
      }

      async function detectFrame() {
        if (cancelled) return;
        let delay = 300;

        try {
          if (
            video.readyState >= 2 &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
          ) {
            const ratio = Math.min(
              640 / video.videoWidth,
              480 / video.videoHeight
            );

            const width = Math.round(
              video.videoWidth * ratio
            );

            const height = Math.round(
              video.videoHeight * ratio
            );

            canvas.width = width;
            canvas.height = height;

            context.drawImage(
              video,
              0,
              0,
              width,
              height
            );

            const blob = await new Promise((resolve) => {
              canvas.toBlob(
                resolve,
                'image/jpeg',
                0.75
              );
            });

            if (!blob || cancelled) return;

            const formData = new FormData();

            formData.append(
              'frame',
              blob,
              'frame.jpg'
            );

            formData.append(
              'client_id',
              CLIENT_ID
            );

            const response = await fetch(GESTURE_API, {
              method: 'POST',
              body: formData,
            });

            if (!response.ok) {
              throw new Error(
                `Gesture API error: ${response.status}`
              );
            }

            const result = await response.json();

            if (cancelled) return;

            setGestureService('online');
            setHandDetected(Boolean(result.hand_detected));

            // The service sets event=true once per new gesture (holding a
            // gesture does not repeat it, switching gestures does).
            if (
              result.event &&
              KNOWN_GESTURES.has(result.gesture)
            ) {
              addMessage(
                'gesture',
                result.gesture,
                result.confidence || 0
              );
            }
          }
        } catch (error) {
          if (!cancelled) {
            console.error(
              'Gesture detection error:',
              error
            );
            setGestureService('offline');
            setHandDetected(false);
            delay = 2000; // back off while the service is unreachable
          }
        }

        if (!cancelled) {
          timeoutId = setTimeout(
            detectFrame,
            delay
          );
        }
      }

      detectFrame();
    }

    startGestureDetection();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      setHandDetected(false);

      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, [isRunning, cameraStream, addMessage]);

  // -----------------------------------------
  // SESSION TIMER
  // -----------------------------------------

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setElapsed((seconds) => seconds + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning]);

  // -----------------------------------------
  // CONTROLS
  // -----------------------------------------

  const start = useCallback(() => {
    setSpeechError(null);
    setIsRunning(true);
  }, []);

  const stop = useCallback(() => {
    shouldRunRef.current = false;
    setIsRunning(false);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setElapsed(0);
  }, []);

  // -----------------------------------------
  // TRANSCRIPT COUNTS
  // -----------------------------------------

  const speechCount = messages.filter(
    (message) => message.type === 'speech'
  ).length;

  const gestureCount = messages.filter(
    (message) => message.type === 'gesture'
  ).length;

  let pending = null;
  if (isRunning && interim) pending = 'speech';
  else if (isRunning && handDetected) pending = 'gesture';

  return {
    isRunning,
    messages,
    pending,
    interim: isRunning ? interim : '',
    elapsed,
    speechCount,
    gestureCount,
    speechError: isRunning && !speechSupported
      ? 'Speech recognition is not supported in this browser. Use Google Chrome or Microsoft Edge. Sign gestures still work.'
      : speechError,
    gestureService,
    handDetected: isRunning && handDetected,
    start,
    stop,
    clear,
  };
}
