// src/components/Table/Pagination.jsx
import React from "react";

const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
  onItemsPerPageChange,
  pageSizes = [10, 25, 50, 100, 200],
}) => {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
      return pageNumbers;
    }

    if (currentPage <= 3) {
      for (let i = 1; i <= 4; i++) pageNumbers.push(i);
      pageNumbers.push("...");
      pageNumbers.push(totalPages);
      return pageNumbers;
    }

    if (currentPage >= totalPages - 2) {
      pageNumbers.push(1);
      pageNumbers.push("...");
      for (let i = totalPages - 3; i <= totalPages; i++) pageNumbers.push(i);
      return pageNumbers;
    }

    // middle case
    pageNumbers.push(1);
    pageNumbers.push("...");
    for (let i = currentPage - 1; i <= currentPage + 1; i++) pageNumbers.push(i);
    pageNumbers.push("...");
    pageNumbers.push(totalPages);
    return pageNumbers;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-white border-t">
      <div className="text-sm text-gray-700">
        Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of{" "}
        <strong>{totalItems}</strong> entries
      </div>

      <div className="flex items-center gap-3">
        {/* Items per page */}
        {onItemsPerPageChange && (
          <div className="flex items-center gap-2">
            <label htmlFor="pageSize" className="text-sm text-gray-600">
              Show
            </label>
            <select
              id="pageSize"
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="px-2 py-1 border rounded"
            >
              {pageSizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Prev */}
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-3 py-2 rounded bg-gray-200 disabled:opacity-50"
        >
          Prev
        </button>

        {/* Page numbers */}
        {getPageNumbers().map((p, i) => (
          <button
            key={i}
            onClick={() => typeof p === "number" && onPageChange(p)}
            disabled={p === "..."}
            className={`min-w-[40px] px-3 py-2 rounded font-medium ${
              p === "..."
                ? "bg-transparent text-gray-500 cursor-default"
                : currentPage === p
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-700 border hover:bg-gray-100"
            }`}
          >
            {p}
          </button>
        ))}

        {/* Next */}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-2 rounded bg-gray-200 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default Pagination;
