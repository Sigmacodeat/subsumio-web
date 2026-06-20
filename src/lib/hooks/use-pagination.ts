"use client";

import { useMemo, useState, useCallback } from "react";

interface UsePaginationOptions {
  total: number;
  initialPage?: number;
  pageSize?: number;
}

interface UsePaginationReturn {
  page: number;
  pageSize: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  hasNext: boolean;
  hasPrev: boolean;
  setPage: (page: number) => void;
  next: () => void;
  prev: () => void;
  reset: () => void;
}

export function usePagination({
  total,
  initialPage = 1,
  pageSize = 25,
}: UsePaginationOptions): UsePaginationReturn {
  const [page, setPageState] = useState(initialPage);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);

  const setPage = useCallback(
    (p: number) => {
      setPageState(Math.max(1, Math.min(p, totalPages)));
    },
    [totalPages],
  );

  const next = useCallback(() => setPage(currentPage + 1), [currentPage, setPage]);
  const prev = useCallback(() => setPage(currentPage - 1), [currentPage, setPage]);
  const reset = useCallback(() => setPageState(1), []);

  return {
    page: currentPage,
    pageSize,
    totalPages,
    startIndex,
    endIndex,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
    setPage,
    next,
    prev,
    reset,
  };
}

export function usePaginatedList<T>(items: T[], pageSize = 25) {
  const pagination = usePagination({ total: items.length, pageSize });

  const paginatedItems = useMemo(
    () => items.slice(pagination.startIndex, pagination.endIndex),
    [items, pagination.startIndex, pagination.endIndex],
  );

  return { ...pagination, items: paginatedItems };
}
