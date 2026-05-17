import { PAGE_SIZE_OPTIONS, type PageSize } from "../lib/pagination";

export function ListPagination({
  page,
  pageSize,
  totalPages,
  totalItems,
  rangeStart,
  rangeEnd,
  canFirst,
  canPrev,
  canNext,
  canLast,
  onPageSizeChange,
  onFirst,
  onPrev,
  onNext,
  onLast,
}: {
  page: number;
  pageSize: PageSize;
  totalPages: number;
  totalItems: number;
  rangeStart: number;
  rangeEnd: number;
  canFirst: boolean;
  canPrev: boolean;
  canNext: boolean;
  canLast: boolean;
  onPageSizeChange: (size: PageSize) => void;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
}) {
  if (totalItems === 0) return null;

  return (
    <nav className="list-pagination" aria-label="Pagination">
      <div className="list-pagination-meta">
        <span>
          {rangeStart}–{rangeEnd} of {totalItems}
        </span>
        <label className="list-pagination-size">
          <span className="sr-only">Items per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
            aria-label="Items per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="list-pagination-nav" aria-label="Page navigation">
        <button type="button" className="page-nav-btn" disabled={!canFirst} onClick={onFirst} aria-label="First page">
          «
        </button>
        <button type="button" className="page-nav-btn" disabled={!canPrev} onClick={onPrev} aria-label="Previous page">
          ‹
        </button>
        <span className="list-pagination-page" aria-live="polite">
          {page} / {totalPages}
        </span>
        <button type="button" className="page-nav-btn" disabled={!canNext} onClick={onNext} aria-label="Next page">
          ›
        </button>
        <button type="button" className="page-nav-btn" disabled={!canLast} onClick={onLast} aria-label="Last page">
          »
        </button>
      </div>
    </nav>
  );
}
