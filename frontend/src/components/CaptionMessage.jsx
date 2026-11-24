import { Mic, Hand } from 'lucide-react';
import { formatTimestamp } from '../utils/formatTime';

const TYPE_CONFIG = {
  speech: { label: 'SPEECH', icon: Mic },
  gesture: { label: 'SIGN GESTURE', icon: Hand },
};

export default function CaptionMessage({ message, index, isLatest }) {
  const config = TYPE_CONFIG[message.type];
  const Icon = config.icon;
  const confidencePct = Math.round((Number(message.confidence) || 0) * 100);
  const speaker = message.speaker ?? (message.type === 'speech' ? 'Teacher' : 'Student');

  return (
    <article
      className={`caption caption--${message.type} ${isLatest ? 'caption--latest' : ''}`}
    >
      <div className="caption-icon">
        <Icon size={18} strokeWidth={2.2} />
      </div>

      <div className="caption-body">
        <div className="caption-meta">
          <span className={`type-badge type-badge--${message.type}`}>{config.label}</span>
          <span className="caption-speaker">{speaker}</span>
          <span className="caption-time">{formatTimestamp(message.timestamp)}</span>
          <span className="caption-index">#{index + 1}</span>
        </div>

        <p className="caption-text">{message.text}</p>

        <div className="caption-footer">
          {message.gesture && (
            <span className="gesture-gloss" title="Recognised sign gloss">
              {message.gesture}
            </span>
          )}
          {/* Some browsers report 0 confidence for speech; hide it instead of showing 0%. */}
          {confidencePct > 0 && (
            <span className="confidence">
              <span className="confidence-bar">
                <span className="confidence-fill" style={{ width: `${confidencePct}%` }} />
              </span>
              {confidencePct}% confidence
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
