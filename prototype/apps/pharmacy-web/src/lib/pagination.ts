import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export function usePagination<T>(items: T[], initialPageSize: PageSize = 10) {
  const [pageSize, setPageSize] = useState<PageSize>(initialPageSize);
  const [page, setPage] = useState(1);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [totalItems, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalItems);

  return {
    pageItems,
    page: safePage,
    pageSize,
    totalPages,
    totalItems,
    rangeStart,
    rangeEnd,
    setPage,
    setPageSize,
    canFirst: safePage > 1,
    canPrev: safePage > 1,
    canNext: safePage < totalPages,
    canLast: safePage < totalPages,
    goFirst: () => setPage(1),
    goPrev: () => setPage((p) => Math.max(1, p - 1)),
    goNext: () => setPage((p) => Math.min(totalPages, p + 1)),
    goLast: () => setPage(totalPages),
  };
}
