import {
  Hand,
  LayoutDashboard,
  GraduationCap,
  History,
  Users,
  Settings,
  Info,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'classroom', label: 'Live Classroom', icon: GraduationCap },
  { id: 'history', label: 'Transcripts', icon: History },
  { id: 'students', label: 'Students', icon: Users },
];

const FOOTER_ITEMS = [
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'about', label: 'About', icon: Info },
];

function NavButton({ item, active, onNavigate }) {
  const Icon = item.icon;
  const isActive = active === item.id;
  return (
    <button
      type="button"
      className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
      onClick={() => onNavigate(item.id)}
      aria-current={isActive ? 'page' : undefined}
      title={item.label}
    >
      <Icon size={18} strokeWidth={2} />
      <span>{item.label}</span>
    </button>
  );
}

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-logo">
          <Hand size={22} strokeWidth={2.2} />
        </div>
        <div className="brand-text">
          <span className="brand-name">SignSpeak</span>
          <span className="brand-tagline">Classroom Assistant</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        <span className="nav-section-label">Workspace</span>
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.id} item={item} active={active} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="sidebar-footer">
        {FOOTER_ITEMS.map((item) => (
          <NavButton key={item.id} item={item} active={active} onNavigate={onNavigate} />
        ))}
        <div className="sidebar-card">
          <p className="sidebar-card-title">Sign Language &amp; Speech-to-Text</p>
          <p className="sidebar-card-text">
            Real-time captions for inclusive classrooms.
          </p>
        </div>
      </div>
    </aside>
  );
}
