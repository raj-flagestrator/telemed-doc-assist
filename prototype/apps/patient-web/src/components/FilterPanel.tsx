import { useEffect } from "react";

export function FilterPanel({
  open,
  onClose,
  title = "Filters",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="filter-drawer-root" role="presentation">
      <button type="button" className="filter-backdrop" aria-label="Close menu" onClick={onClose} />
      <aside className="filter-drawer" role="dialog" aria-modal="true" aria-labelledby="filter-drawer-title">
        <header className="filter-drawer-head">
          <h2 id="filter-drawer-title">{title}</h2>
          <button type="button" className="filter-drawer-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="filter-drawer-body">{children}</div>
      </aside>
    </div>
  );
}
