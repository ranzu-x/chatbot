import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import "../forum.css";

const ForumUIContext = createContext(null);
const THEME_KEY = "forum_theme";

const TOAST_ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };

/**
 * Renders the portal's root element (`.fm-root`, where all the forum's
 * design tokens live) plus its own light/dark theme, toast stack and
 * confirm dialog — so the forum needs nothing from the dashboard's
 * utils/alerts.js (SweetAlert) or index.css.
 */
export function ForumUIProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; }
  });
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const toastId = useRef(0);

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  const toast = useCallback((message, type = "success") => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  }, []);

  /** Resolves true/false — the forum's replacement for a native/SweetAlert confirm. */
  const confirm = useCallback(({ title, text, confirmLabel = "Confirm", danger = false }) => (
    new Promise((resolve) => setDialog({ title, text, confirmLabel, danger, resolve }))
  ), []);

  const closeDialog = (result) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  return (
    <ForumUIContext.Provider value={{ theme, toggleTheme, toast, confirm }}>
      <div className={`fm-root ${theme === "dark" ? "fm-dark" : ""}`}>
        {children}

        <div className="fm-toasts" aria-live="polite">
          {toasts.map((t) => {
            const Icon = TOAST_ICONS[t.type] || Info;
            return (
              <div key={t.id} className={`fm-toast fm-toast-${t.type}`}>
                <Icon size={16} /> <span>{t.message}</span>
              </div>
            );
          })}
        </div>

        {dialog && (
          <div className="fm-modal-backdrop" onClick={() => closeDialog(false)}>
            <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="fm-modal-x" onClick={() => closeDialog(false)} aria-label="Close"><X size={16} /></button>
              <h3>{dialog.title}</h3>
              {dialog.text && <p>{dialog.text}</p>}
              <div className="fm-modal-actions">
                <button type="button" className="fm-btn fm-btn-secondary" onClick={() => closeDialog(false)}>Cancel</button>
                <button type="button" className={`fm-btn ${dialog.danger ? "fm-btn-danger" : "fm-btn-primary"}`} onClick={() => closeDialog(true)}>
                  {dialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ForumUIContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useForumUI = () => {
  const ctx = useContext(ForumUIContext);
  if (!ctx) throw new Error("useForumUI must be used within ForumUIProvider");
  return ctx;
};
