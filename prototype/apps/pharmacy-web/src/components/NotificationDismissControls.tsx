export function NotificationDismissButton({
  onClick,
  busy,
}: {
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      className="notice-dismiss"
      aria-label="Dismiss notification"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      ×
    </button>
  );
}

export function NotificationDismissAllButton({
  onClick,
  busy,
}: {
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      className="btn-notice-dismiss-all"
      aria-label="Dismiss all notifications"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      ×
      <span className="btn-notice-dismiss-all-label">Dismiss all</span>
    </button>
  );
}
