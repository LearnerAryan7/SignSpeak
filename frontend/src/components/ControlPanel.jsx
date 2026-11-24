import { Play, Square, Trash2 } from 'lucide-react';

export default function ControlPanel({ isRunning, hasMessages, onStart, onStop, onClear }) {
  return (
    <div className="controls" role="group" aria-label="Recognition controls">
      <button
        type="button"
        className="btn btn--primary"
        onClick={onStart}
        disabled={isRunning}
      >
        <Play size={16} strokeWidth={2.4} />
        Start Recognition
      </button>
      <button
        type="button"
        className="btn btn--danger"
        onClick={onStop}
        disabled={!isRunning}
      >
        <Square size={15} strokeWidth={2.4} />
        Stop Recognition
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={onClear}
        disabled={!hasMessages}
      >
        <Trash2 size={16} strokeWidth={2.2} />
        Clear Transcript
      </button>
    </div>
  );
}
