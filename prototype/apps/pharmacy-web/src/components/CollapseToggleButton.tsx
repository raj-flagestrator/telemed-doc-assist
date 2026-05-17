type Props = {
  expanded: boolean;
  onToggle: () => void;
  label?: string;
};

export function CollapseToggleButton({ expanded, onToggle, label = "Toggle details" }: Props) {
  return (
    <button
      type="button"
      className="list-card-collapse-toggle"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
      title={expanded ? "Collapse" : "Expand"}
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {expanded ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
      </svg>
    </button>
  );
}
