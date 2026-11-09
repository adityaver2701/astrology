import { useEffect, useState } from 'react';
import {
  signUp, signIn, resendConfirmation,
  signInWithGoogle, getAuthProviders, oauthErrorMessage,
} from './cloudSync';
import { isNative } from './apiBase';
import { nativeSupportsGoogleSignIn } from './native/index.js';
import ZodiacWheel from './components/ZodiacWheel';

// Google's "G" mark, as required on "Sign in with Google" buttons by Google's
// branding guidelines (multicolour, unmodified, on a plain background).
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** An OAuth error the provider put in the URL we were redirected back to (web). */
function oauthErrorFromUrl() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  new URLSearchParams(window.location.search).forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  const raw = params.get('error_description') || params.get('error');
  return raw ? oauthErrorMessage(raw, params.get('error')) : '';
}

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
  // Seeded from the URL so a cancelled/failed Google redirect explains itself.
  const [error, setError] = useState(oauthErrorFromUrl);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const native = isNative();

  // Offer Google only when the Supabase project has it enabled (and, in the
  // Android app, only on APKs that can receive the redirect back).
  useEffect(() => {
    let alive = true;
    Promise.all([getAuthProviders(), nativeSupportsGoogleSignIn()])
      .then(([providers, nativeOk]) => { if (alive) setGoogleReady(providers.google && nativeOk); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    // Strip OAuth error params so a reload doesn't show the error again.
    if (oauthErrorFromUrl()) window.history.replaceState(null, '', window.location.pathname);
    // Android: errors from the deep-link return (src/native/index.js).
    const onOAuthError = (e) => { setGoogleBusy(false); setError(e.detail || 'Google sign-in failed.'); };
    // Android: came back from the browser without finishing — re-enable the button.
    let t;
    const onResume = () => { clearTimeout(t); t = setTimeout(() => setGoogleBusy(false), 1500); };
    window.addEventListener('astro:oauth-error', onOAuthError);
    window.addEventListener('astro:resume', onResume);
    return () => {
      clearTimeout(t);
      window.removeEventListener('astro:oauth-error', onOAuthError);
      window.removeEventListener('astro:resume', onResume);
    };
  }, []);

  const handleGoogle = async () => {
    setError('');
    setInfo('');
    setGoogleBusy(true);
    try {
      await signInWithGoogle({ native });
      // Web: the page is navigating to Google now. Android: the browser is
      // open; the deep link (or resume) handlers above take it from here.
    } catch (err) {
      setError(err.message || 'Could not start Google sign-in.');
      setGoogleBusy(false);
    }
  };
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
      <div className="auth-layout">
      {/* Brand panel: what the app does, before asking anyone for a password. */}
      <section className="auth-hero">
        <ZodiacWheel size={260} spin className="auth-wheel" />
        <h1 className="auth-hero-title">Astro-Transit</h1>
        <p className="auth-hero-tag">
          Your Vedic birth chart, the sky above you today, and the timing in between.
        </p>
        <ul className="auth-features">
          <li>
            <span className="auth-feature-icon" aria-hidden="true">☉</span>
            <span><strong>Sidereal birth chart</strong>Lahiri positions, North-Indian Kundali and divisional charts.</span>
          </li>
          <li>
            <span className="auth-feature-icon" aria-hidden="true">☽</span>
            <span><strong>Dasha &amp; live transits</strong>Vimshottari timeline, Sade Sati and today’s Moon through your houses.</span>
          </li>
          <li>
            <span className="auth-feature-icon" aria-hidden="true">✦</span>
            <span><strong>Life-event matching</strong>Find the transit signature of past events — and when it returns.</span>
          </li>
        </ul>
      </section>

      <div className="auth-card">
        <div className="auth-brand">
          <h2 className="auth-title">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
          <p className="auth-tagline">
            {mode === 'register'
              ? 'Free, private, and synced across your devices.'
              : 'Sign in to open your saved charts.'}
          </p>
        </div>

        {googleReady && (
          <>
            <button
              type="button"
              className="google-btn"
              onClick={handleGoogle}
              disabled={busy || googleBusy}
              data-testid="google-signin"
            >
              <GoogleLogo />
              <span>
                {googleBusy
                  ? (native ? 'Continue in your browser…' : 'Redirecting to Google…')
                  : mode === 'register' ? 'Sign up with Google' : 'Continue with Google'}
              </span>
            </button>
            <div className="auth-divider" role="separator"><span>or use email</span></div>
          </>
        )}

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
    </div>
  );
}
