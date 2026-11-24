import { FileText, Mic, Hand, Activity } from 'lucide-react';

function StatCard({ icon: Icon, label, value, variant }) {
  return (
    <div className={`stat-card stat-card--${variant}`}>
      <div className="stat-icon">
        <Icon size={17} strokeWidth={2.2} />
      </div>
      <div>
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </div>
    </div>
  );
}

export default function StatsPanel({ total, speechCount, gestureCount, isRunning }) {
  const speechPct = total ? Math.round((speechCount / total) * 100) : 0;

  return (
    <section className="panel stats-panel" aria-label="Transcript statistics">
      <div className="panel-header panel-header--compact">
        <h2 className="panel-title">Transcript Summary</h2>
        <span className={`activity ${isRunning ? 'activity--on' : ''}`}>
          <Activity size={14} /> {isRunning ? 'Recording' : 'Paused'}
        </span>
      </div>

      <div className="stats-grid">
        <StatCard icon={FileText} label="Total messages" value={total} variant="total" />
        <StatCard icon={Mic} label="Speech" value={speechCount} variant="speech" />
        <StatCard icon={Hand} label="Sign gestures" value={gestureCount} variant="gesture" />
      </div>

      <div className="ratio">
        <div className="ratio-bar">
          <span className="ratio-speech" style={{ width: `${total ? speechPct : 50}%` }} />
          <span className="ratio-gesture" style={{ width: `${total ? 100 - speechPct : 50}%` }} />
        </div>
        <div className="ratio-labels">
          <span>Speech {total ? `${speechPct}%` : '—'}</span>
          <span>Gesture {total ? `${100 - speechPct}%` : '—'}</span>
        </div>
      </div>
    </section>
  );
}
