
import { useEffect, useRef } from 'react';
import { Video, VideoOff, Hand, Server } from 'lucide-react';

const SERVICE_TEXT = {
  online: 'Gesture service online',
  offline: 'Gesture service offline',
  unknown: 'Gesture service: waiting for recognition',
};

export default function WebcamPanel({
  cameraOn,
  cameraStream,
  mirror = true,
  isRunning = false,
  handDetected = false,
  gestureService = 'unknown',
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  return (
    <section className="panel webcam-panel" aria-label="Webcam preview">
      <div className="panel-header panel-header--compact">
        <h2 className="panel-title">Webcam Preview</h2>

        <span className={`live-tag ${cameraOn ? 'live-tag--on' : ''}`}>
          {cameraOn ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      <div className={`webcam-frame ${cameraOn ? 'webcam-frame--on' : ''}`}>
        {cameraOn ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`webcam-video ${mirror ? 'webcam-video--mirrored' : ''}`}
            />

            <div className="webcam-overlay-info">
              <Video size={13} />
              Camera Live
            </div>

            {isRunning && (
              <div className={`hand-chip ${handDetected ? 'hand-chip--on' : ''}`}>
                <Hand size={13} />
                {handDetected ? 'Hand detected' : 'No hand'}
              </div>
            )}
          </>
        ) : (
          <div className="webcam-placeholder">
            <VideoOff size={36} strokeWidth={1.6} />
            <p>Camera is off</p>
            <span>Turn on the webcam in the top bar, or start recognition.</span>
          </div>
        )}
      </div>

      <div className={`service-line service-line--${gestureService}`}>
        <Server size={14} />
        {SERVICE_TEXT[gestureService]}
      </div>
    </section>
  );
}
