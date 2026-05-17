type Props = {
  onClick: () => void;
};

export function SignOutIconButton({ onClick }: Props) {
  return (
    <button
      type="button"
      className="btn-signout"
      onClick={onClick}
      aria-label="Sign out"
      title="Sign out"
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
        <path d="M12 2v10" />
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      </svg>
    </button>
  );
}
