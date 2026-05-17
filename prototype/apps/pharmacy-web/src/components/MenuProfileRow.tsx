export function MenuProfileRow({
  name,
  loading,
  onEdit,
}: {
  name: string;
  loading?: boolean;
  onEdit: () => void;
}) {
  return (
    <section className="menu-section menu-section-profile">
      <div className="menu-profile-row">
        <span className="menu-profile-name">{loading ? "Loading…" : name || "—"}</span>
        <button
          type="button"
          className="menu-profile-edit-btn"
          aria-label="Edit profile"
          onClick={onEdit}
          disabled={loading}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 20h4l10.5-10.5a1.5 1.5 0 0 0 0-2.12L15.62 4.38a1.5 1.5 0 0 0-2.12 0L3 14.88V20z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
            <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}
