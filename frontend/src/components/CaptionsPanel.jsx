import { useEffect, useRef } from 'react';
import { MessageSquare, Mic, Hand } from 'lucide-react';
import CaptionMessage from './CaptionMessage';

function EmptyState({ isRunning }) {
  return (
    <div className="captions-empty">
      <div className="captions-empty-icon">
        <MessageSquare size={30} strokeWidth={1.8} />
      </div>
      <h3>{isRunning ? 'Waiting for input…' : 'No captions yet'}</h3>
      <p>
        {isRunning
          ? 'Speak or sign in front of the camera. Captions will appear here in real time.'
          : 'Press “Start Recognition” to begin generating live captions from speech and sign gestures.'}
      </p>
    </div>
  );
}

function TypingIndicator({ type, text }) {
  const isSpeech = type === 'speech';
  const Icon = isSpeech ? Mic : Hand;
  return (
    <div className={`typing typing--${type}`} aria-live="polite">
      <Icon size={15} strokeWidth={2.2} />
      {/* Words being spoken right now, before the phrase is final. */}
      {isSpeech && text ? (
        <span className="typing-text">{text}</span>
      ) : (
        <span>{isSpeech ? 'Listening to speech' : 'Detecting sign gesture'}</span>
      )}
      <span className="typing-dots" aria-hidden="true">
        <i /><i /><i />
      </span>
    </div>
  );
}

export default function CaptionsPanel({ messages, pending, interim = '', isRunning }) {
  const listRef = useRef(null);

  // Keep the newest caption in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending, interim]);

  return (
    <section className="panel captions-panel" aria-label="Live captions">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Live Captions</h2>
          <p className="panel-subtitle">Speech and sign language combined into one transcript</p>
        </div>
        <div className="legend">
          <span className="legend-item legend-item--speech"><Mic size={13} /> Speech</span>
          <span className="legend-item legend-item--gesture"><Hand size={13} /> Sign Gesture</span>
        </div>
      </div>

      <div className="captions-list" ref={listRef} aria-live="polite">
        {messages.length === 0 && !pending ? (
          <EmptyState isRunning={isRunning} />
        ) : (
          messages.map((msg, i) => (
            <CaptionMessage
              key={msg.id}
              message={msg}
              index={i}
              isLatest={i === messages.length - 1}
            />
          ))
        )}
        {isRunning && pending && <TypingIndicator type={pending} text={interim} />}
      </div>
    </section>
  );
}
