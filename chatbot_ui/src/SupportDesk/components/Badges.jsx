const STATUS_LABELS = {
  PENDING: "Pending",
  ANSWERED: "Answered",
  ON_HOLD: "On Hold",
  SOLVED: "Solved",
  CLOSED: "Closed",
};

export function StatusBadge({ status }) {
  return <span className={`sd-badge sd-badge-${(status || "pending").toLowerCase()}`}>{STATUS_LABELS[status] || status}</span>;
}

export function PriorityBadge({ priority }) {
  return <span className={`sd-badge sd-badge-${(priority || "normal").toLowerCase()}`}>{priority || "NORMAL"}</span>;
}
