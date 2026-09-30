/**
 * Row / select-all toggle for list selection (User Manager, Subscribers).
 * A small switch instead of a tick box; styles are `.select-toggle` in index.css.
 */
export default function SelectToggle({ checked, onChange, label = 'Select', indeterminate = false }) {
  return (
    <label className={`select-toggle${indeterminate && !checked ? ' is-partial' : ''}`} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={Boolean(checked)} onChange={onChange} aria-label={label} />
      <span className="select-toggle__slider" aria-hidden="true" />
    </label>
  );
}
