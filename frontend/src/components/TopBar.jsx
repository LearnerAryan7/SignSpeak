
import { Mic, MicOff, Video, VideoOff, Clock, Radio } from 'lucide-react';
import StatusIndicator from './StatusIndicator';
import { formatDuration } from '../utils/formatTime';

export default function TopBar({
  isRunning,
  elapsed,
  cameraOn,
  onToggleCamera,
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className={`app-status ${isRunning ? 'app-status--live' : ''}`}>
          <Radio size={16} strokeWidth={2.2} />
          <span>
            {isRunning ? 'Recognition Live' : 'Recognition Stopped'}
          </span>
        </div>

        <div className="session-timer" title="Session duration">
          <Clock size={15} strokeWidth={2.2} />
          <span>{formatDuration(elapsed)}</span>
        </div>
      </div>

      <div className="topbar-right">
        <StatusIndicator
          icon={Mic}
          offIcon={MicOff}
          label="Microphone"
          active={isRunning}
          activeText="Listening"
          idleText="Off"
        />

        <StatusIndicator
          icon={Video}
          offIcon={VideoOff}
          label="Webcam"
          active={cameraOn}
          activeText="Camera On"
          idleText="Camera Off"
          onClick={onToggleCamera}
        />

        <div className="user-chip" title="Signed in as teacher">
          <span className="user-avatar">MS</span>
          <div className="user-meta">
            <span className="user-name">Ms. Sharma</span>
            <span className="user-role">Teacher</span>
          </div>
        </div>
      </div>
    </header>
  );
}
