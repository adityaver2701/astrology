import { useState } from 'react';
import { signUp, signIn, resendConfirmation } from './cloudSync';

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
          <input
            className="text-input auth-input"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={busy}
          />

          {mode === 'register' && (
            <>
              <label className="auth-label">Confirm Password</label>
              <input
                className="text-input auth-input"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                disabled={busy}
              />
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
