import { useState } from 'react';
import { signUp, signIn, resendConfirmation } from './cloudSync';

// Eye / eye-off icon for the password show/hide toggle (module-level so it is
// not re-created on every render).
function EyeIcon({ off }) {
  return off ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ── Auth gate ──────────────────────────────────────────────────────────────
// Register / login screen shown when no user session exists. On success the
// parent's onAuthStateChange listener picks up the new session and unmounts
// this screen, so we don't need an explicit onAuthed callback for the happy
// path — but we accept one so the parent can react immediately if it wants.
export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pendingEmail, setPendingEmail] = useState(''); // awaiting confirmation

  const reset = () => { setError(''); setInfo(''); };

  const switchMode = (m) => {
    setMode(m);
    reset();
    setPassword('');
    setConfirm('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    reset();
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'register') {
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
      if (password !== confirm) { setError('Passwords do not match.'); return; }
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        const { needsConfirmation, session } = await signUp(email, password);
        if (needsConfirmation) {
          setPendingEmail(email.trim());
          setInfo(`Almost there! We sent a confirmation link to ${email.trim()}. Click it, then sign in.`);
          setMode('login');
        } else if (session && onAuthed) {
          onAuthed(session);
        }
      } else {
        const { session } = await signIn(email, password);
        if (session && onAuthed) onAuthed(session);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    reset();
    setBusy(true);
    try {
      await resendConfirmation(pendingEmail || email);
      setInfo(`Confirmation email re-sent to ${pendingEmail || email.trim()}.`);
    } catch (err) {
      setError(err.message || 'Could not resend.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-glyph">☉</span>
          <h1 className="auth-title">Astro-Transit Chart</h1>
          <p className="auth-tagline">Vedic Jyotish & Karmic Trik Bhava Analytics</p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab${mode === 'login' ? ' active' : ''}`}
            onClick={() => switchMode('login')}
          >Sign In</button>
          <button
            type="button"
            className={`auth-tab${mode === 'register' ? ' active' : ''}`}
            onClick={() => switchMode('register')}
          >Create Account</button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label">Email</label>
          <input
            className="text-input auth-input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={busy}
          />

          <label className="auth-label">Password</label>
          <div className="auth-pw-wrap">
            <input
              className="text-input auth-input auth-pw-input"
              type={showPw ? 'text' : 'password'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={busy}
            />
            <button type="button" className="auth-pw-eye" onClick={() => setShowPw(v => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'} title={showPw ? 'Hide password' : 'Show password'}>
              <EyeIcon off={showPw} />
            </button>
          </div>

          {mode === 'register' && (
            <>
              <label className="auth-label">Confirm Password</label>
              <div className="auth-pw-wrap">
                <input
                  className="text-input auth-input auth-pw-input"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  disabled={busy}
                />
                <button type="button" className="auth-pw-eye" onClick={() => setShowConfirm(v => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'} title={showConfirm ? 'Hide password' : 'Show password'}>
                  <EyeIcon off={showConfirm} />
                </button>
              </div>
            </>
          )}

          {error && <div className="auth-msg auth-error">⚠ {error}</div>}
          {info && <div className="auth-msg auth-info">✓ {info}</div>}

          <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'register' ? 'Create Account' : 'Sign In'}
          </button>

          {pendingEmail && mode === 'login' && (
            <button type="button" className="auth-link" onClick={handleResend} disabled={busy}>
              Resend confirmation email
            </button>
          )}
        </form>

        <p className="auth-foot">
          {mode === 'login'
            ? <>No account yet? <button type="button" className="auth-link" onClick={() => switchMode('register')}>Create one</button></>
            : <>Already registered? <button type="button" className="auth-link" onClick={() => switchMode('login')}>Sign in</button></>}
        </p>
        <p className="auth-note">
          Your profiles, reports and charts are private to your account and stored securely in the cloud.
        </p>
      </div>
    </div>
  );
}
