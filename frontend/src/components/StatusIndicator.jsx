
export default function StatusIndicator({
  icon: Icon,
  offIcon: OffIcon,
  label,
  active,
  activeText = 'Active',
  idleText = 'Idle',
  onClick,
}) {
  const ShownIcon = !active && OffIcon ? OffIcon : Icon;

  const content = (
    <>
      <ShownIcon size={15} strokeWidth={2.2} />
      <span className="status-pill-label">{label}</span>
      <span className="status-dot" aria-hidden="true" />
      <span className="status-pill-state">
        {active ? activeText : idleText}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`status-pill ${active ? 'status-pill--on' : 'status-pill--off'}`}
        onClick={onClick}
        aria-label={`${label}: ${active ? 'Turn off' : 'Turn on'}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`status-pill ${active ? 'status-pill--on' : 'status-pill--off'}`}>
      {content}
    </div>
  );
}
