type Props = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
};

export function NewBookingIconButton({
  onClick,
  disabled,
  className,
  label = "Book new visit",
}: Props) {
  return (
    <button
      type="button"
      className={["btn-icon-new", className].filter(Boolean).join(" ")}
      onClick={onClick}
      disabled={disabled}
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
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  );
}
