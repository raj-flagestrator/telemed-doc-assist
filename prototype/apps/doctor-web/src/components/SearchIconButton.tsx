type Props = {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
};

export function SearchIconButton({
  onClick,
  active,
  disabled,
  className,
  label = "Find appointment",
}: Props) {
  return (
    <button
      type="button"
      className={["btn-icon-search", active ? "open" : "", className].filter(Boolean).join(" ")}
      onClick={onClick}
      disabled={disabled}
      aria-expanded={active}
      aria-label={label}
      title={label}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" />
      </svg>
    </button>
  );
}
