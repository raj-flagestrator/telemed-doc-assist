type Props = {
  onClick: () => void;
  disabled?: boolean;
  spinning?: boolean;
  className?: string;
};

export function RefreshIconButton({ onClick, disabled, spinning, className }: Props) {
  return (
    <button
      type="button"
      className={["btn-icon-refresh", spinning ? "spinning" : "", className].filter(Boolean).join(" ")}
      onClick={onClick}
      disabled={disabled}
      aria-label="Refresh"
      title="Refresh"
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
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <polyline points="21 3 21 12 12 12" />
      </svg>
    </button>
  );
}
