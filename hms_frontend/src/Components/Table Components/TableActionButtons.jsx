// src/components/Table/TableActions.jsx
import React from "react";
import { FaEye, FaUserEdit } from "react-icons/fa";
import { MdDelete } from "react-icons/md";

/**
 * Props:
 * - onView(item) optional
 * - onEdit(item) optional
 * - onDelete(item) optional
 * - extraActions: array of { key, label, icon, onClick(item) } optional
 * - item: the row item
 * - compact: boolean -> reduce padding / stack vertically on small screens
 */
const IconButton = ({ onClick, children, title }) => (
  <button
    onClick={onClick}
    title={title}
    className="px-3 py-2 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors duration-150
               bg-white hover:bg-gray-100 border border-gray-200 shadow-sm"
    aria-label={title}
  >
    {children}
  </button>
);

const TableActions = ({ item, onView, onEdit, onDelete, extraActions = [], compact = false }) => {
  return (
    <div className={`flex ${compact ? "flex-col sm:flex-row" : "flex-row"} items-center justify-center gap-2`}>
      {onView && (
        <IconButton onClick={() => onView(item)} title="View">
          <FaEye className="text-green-600" />
        </IconButton>
      )}

      {onEdit && (
        <IconButton onClick={() => onEdit(item)} title="Edit">
          <FaUserEdit className="text-amber-600" />
        </IconButton>
      )}

      {onDelete && (
        <IconButton
          onClick={() => {
            // small confirm wrapper could exist here or you can keep deletion logic in parent
            onDelete(item);
          }}
          title="Delete"
        >
          <MdDelete className="text-rose-600" />
        </IconButton>
      )}

      {extraActions.map((a) => (
        <IconButton key={a.key} onClick={() => a.onClick(item)} title={a.label}>
          {a.icon ? a.icon : a.label}
        </IconButton>
      ))}
    </div>
  );
};

export default TableActions;
