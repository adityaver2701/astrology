import { IconCheck, IconClose, IconSparkle } from './Icons';

// ── Toast notifications ───────────────────────────────────────────────────
// Short confirmations ("Link copied", "Profile saved") that used to be done
// by swapping a button's label for a few seconds — easy to miss, and the
// button changed width under the cursor. App.jsx owns the queue (see
// `notify`); this component only renders it.
//
// The region is aria-live so screen readers announce each message without
// moving focus.
export default function Toaster({ toasts, onDismiss }) {
  return (
    <div className="toaster" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.tone || 'ok'}`}>
          <span className="toast-icon" aria-hidden="true">
            {t.tone === 'warn' ? '!' : t.tone === 'info' ? <IconSparkle size={15} /> : <IconCheck size={15} />}
          </span>
          <span className="toast-text">{t.text}</span>
          <button type="button" className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Dismiss notification">
            <IconClose size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
