import React, { useState, useMemo } from 'react';
import {
  Search, ChevronDown, Download, RefreshCw, ChevronLeft, ChevronRight,
  Eye, Edit2, Trash2, Clock, Users, Key, MoreVertical, Plus, Check
} from 'lucide-react';

/**
 * Universal BotSailor-Style Data Table Component
 *
 * Props:
 * - title: string
 * - subtitle: string
 * - actions: ReactNode (e.g. + Create button, custom buttons)
 * - filters: Array<{ key, placeholder, options: [{ label, value }], value, onChange }>
 * - searchPlaceholder: string
 * - onSearch: (query) => void
 * - columns: Array<{ key, label, width, render: (row, index) => ReactNode, sortable?: boolean }>
 * - data: Array<Object>
 * - loading: boolean
 * - emptyIcon: ReactNode
 * - emptyTitle: string
 * - emptySubtitle: string
 * - onRowClick: (row) => void
 * - onExportCSV: () => void
 * - onRefresh: () => void
 * - pagination: { page, limit, total, onPageChange, onLimitChange }
 * - selectable: boolean
 * - selectedIds: Set
 * - onToggleSelectAll: () => void
 * - onToggleSelectOne: (id) => void
 */
export default function DataTable({
  title,
  subtitle,
  actions,
  filters = [],
  searchPlaceholder = "Search & Enter...",
  search = "",
  onSearch,
  columns = [],
  data = [],
  loading = false,
  emptyIcon = <Users size={40} color="#94a3b8" />,
  emptyTitle = "No records found",
  emptySubtitle = "Try adjusting your filters or create a new entry.",
  onRowClick,
  onExportCSV,
  onRefresh,
  pagination,
  selectable = true,
  selectedIds = new Set(),
  onToggleSelectAll,
  onToggleSelectOne,
  idKey = "id",
}) {
  const [showOptions, setShowOptions] = useState(false);

  const total = pagination?.total ?? data.length;
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 10;
  const totalPages = Math.ceil(total / limit) || 1;

  const allSelected = data.length > 0 && data.every(row => selectedIds.has(row[idKey]));

  const handleSelectAll = () => {
    if (onToggleSelectAll) {
      onToggleSelectAll();
    }
  };

  return (
    <div className="datatable-container" style={{ width: '100%' }}>
      <style>{`
        .bs-table th {
          padding: 12px 14px;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #5c5c80;
          border-bottom: 1px solid #e4e4f0;
          background: #f8f8fc;
          white-space: nowrap;
          text-align: left;
        }
        .bs-table td {
          padding: 13px 14px;
          font-size: 0.83rem;
          border-bottom: 1px solid #e4e4f0;
          vertical-align: middle;
          background: #ffffff;
          transition: background 0.15s;
        }
        .bs-table tr:hover td {
          background: #f8f8fc;
        }
        .bs-action-btn {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid #e4e4f0;
          background: #ffffff;
          color: #5c5c80;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 0.8rem;
          transition: all 0.15s ease;
        }
        .bs-action-btn:hover {
          border-color: #6366f1;
          color: #6366f1;
          background: rgba(99, 102, 241, 0.08);
          transform: translateY(-1px);
        }
        .bs-action-btn.delete:hover {
          border-color: #ef4444;
          color: #ef4444;
          background: rgba(239, 68, 68, 0.08);
        }
        .bs-toggle-switch {
          position: relative;
          display: inline-block;
          width: 36px;
          height: 20px;
          cursor: pointer;
        }
        .bs-toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .bs-toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #cbd5e1;
          transition: .22s;
          border-radius: 20px;
        }
        .bs-toggle-slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .22s;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        input:checked + .bs-toggle-slider {
          background-color: #10b981;
        }
        input:checked + .bs-toggle-slider:before {
          transform: translateX(16px);
        }
      `}</style>

      {/* ── Page Header ── */}
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            {title && (
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: '#1a1a2e' }}>
                {title}
              </h1>
            )}
            {subtitle && (
              <p style={{ fontSize: '0.82rem', color: '#5c5c80', margin: '3px 0 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>

          {actions && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {actions}
            </div>
          )}
        </div>
      )}

      {/* ── Filter / Search Bar ── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e4e4f0',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        {/* Dropdown Filters */}
        {filters.map((filter) => (
          <div key={filter.key} style={{ position: 'relative', minWidth: 150, flex: '1 1 140px' }}>
            <select
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 30px 9px 12px',
                borderRadius: 8,
                border: '1px solid #e4e4f0',
                background: '#f8f8fc',
                color: '#1a1a2e',
                fontSize: '0.84rem',
                appearance: 'none',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="">{filter.placeholder}</option>
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              color="#9999bb"
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
          </div>
        ))}

        {/* Search Input */}
        {onSearch && (
          <div style={{ position: 'relative', flex: '2 1 220px', minWidth: 180 }}>
            <Search
              size={15}
              color="#9999bb"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 34px',
                borderRadius: 8,
                border: '1px solid #e4e4f0',
                background: '#f8f8fc',
                color: '#1a1a2e',
                fontSize: '0.84rem',
                outline: 'none',
              }}
            />
          </div>
        )}

        {/* Options Button */}
        {(onExportCSV || onRefresh) && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowOptions((prev) => !prev)}
              style={{
                padding: '9px 14px',
                borderRadius: 8,
                border: '1px solid #e4e4f0',
                background: '#ffffff',
                color: '#5c5c80',
                fontSize: '0.84rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Options <ChevronDown size={14} />
            </button>

            {showOptions && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '110%',
                  background: '#ffffff',
                  border: '1px solid #e4e4f0',
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  zIndex: 100,
                  width: 160,
                  overflow: 'hidden',
                }}
              >
                {onExportCSV && (
                  <div
                    onClick={() => {
                      onExportCSV();
                      setShowOptions(false);
                    }}
                    style={{
                      padding: '10px 14px',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      borderBottom: '1px solid #f0f0fa',
                      color: '#1a1a2e',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = '#f8f8fc')}
                    onMouseOut={(e) => (e.currentTarget.style.background = '#ffffff')}
                  >
                    <Download size={14} color="#6366f1" /> Export CSV
                  </div>
                )}
                {onRefresh && (
                  <div
                    onClick={() => {
                      onRefresh();
                      setShowOptions(false);
                    }}
                    style={{
                      padding: '10px 14px',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: '#1a1a2e',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = '#f8f8fc')}
                    onMouseOut={(e) => (e.currentTarget.style.background = '#ffffff')}
                  >
                    <RefreshCw size={14} color="#10b981" /> Refresh List
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Table Card ── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e4e4f0',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="bs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {selectable && (
                  <th style={{ width: 55 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>#</span>
                      <label className="bs-toggle-switch" style={{ transform: 'scale(0.72)', margin: 0 }}>
                        <input type="checkbox" checked={allSelected} onChange={handleSelectAll} />
                        <span className="bs-toggle-slider" />
                      </label>
                    </div>
                  </th>
                )}
                {columns.map((col) => (
                  <th key={col.key} style={{ width: col.width || 'auto' }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length + (selectable ? 1 : 0)} style={{ padding: 50, textAlign: 'center' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 10px' }} />
                    <p style={{ color: '#5c5c80', fontSize: '0.84rem' }}>Loading records...</p>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (selectable ? 1 : 0)} style={{ padding: 50, textAlign: 'center' }}>
                    <div style={{ margin: '0 auto 10px', display: 'flex', justifyContent: 'center' }}>
                      {emptyIcon}
                    </div>
                    <h3 style={{ fontSize: '0.98rem', fontWeight: 600, margin: '0 0 4px 0', color: '#1a1a2e' }}>
                      {emptyTitle}
                    </h3>
                    <p style={{ color: '#5c5c80', fontSize: '0.82rem', margin: 0 }}>
                      {emptySubtitle}
                    </p>
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => {
                  const rowId = row[idKey] ?? idx;
                  const isChecked = selectedIds.has(rowId);
                  const rowNumber = (page - 1) * limit + idx + 1;

                  return (
                    <tr
                      key={rowId}
                      style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                      onClick={() => onRowClick && onRowClick(row)}
                    >
                      {selectable && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5c5c80', minWidth: 16 }}>
                              {rowNumber}
                            </span>
                            <label className="bs-toggle-switch" style={{ transform: 'scale(0.72)', margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (onToggleSelectOne) onToggleSelectOne(rowId);
                                }}
                              />
                              <span className="bs-toggle-slider" />
                            </label>
                          </div>
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col.key}>
                          {col.render ? col.render(row, idx) : (row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {pagination && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              borderTop: '1px solid #e4e4f0',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            {/* Limit Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.8rem', color: '#9999bb' }}>Showing</span>
              <select
                value={limit}
                onChange={(e) => pagination.onLimitChange && pagination.onLimitChange(Number(e.target.value))}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid #e4e4f0',
                  background: '#ffffff',
                  color: '#1a1a2e',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span style={{ fontSize: '0.8rem', color: '#9999bb' }}>
                {total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </span>
            </div>

            {/* Pages Navigation */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                onClick={() => pagination.onPageChange && pagination.onPageChange(Math.max(1, page - 1))}
                disabled={page <= 1}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid #e4e4f0',
                  background: '#ffffff',
                  color: page <= 1 ? '#9999bb' : '#5c5c80',
                  fontSize: '0.8rem',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ChevronLeft size={14} /> Previous
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .slice(0, 5)
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => pagination.onPageChange && pagination.onPageChange(p)}
                    style={{
                      minWidth: 30,
                      height: 30,
                      padding: '0 8px',
                      borderRadius: 6,
                      border: `1px solid ${p === page ? '#6366f1' : '#e4e4f0'}`,
                      background: p === page ? '#6366f1' : '#ffffff',
                      color: p === page ? '#ffffff' : '#5c5c80',
                      fontWeight: p === page ? 700 : 400,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    {p}
                  </button>
                ))}

              <button
                onClick={() => pagination.onPageChange && pagination.onPageChange(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid #e4e4f0',
                  background: '#ffffff',
                  color: page >= totalPages ? '#9999bb' : '#5c5c80',
                  fontSize: '0.8rem',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
