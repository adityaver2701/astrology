import { useEffect, useRef, useState } from 'react';
import { getSession } from './cloudSync';
import { apiUrl } from './apiBase';

// ── AI chat over saved profiles (admin only) ───────────────────────────────
// Full-conversation chat against the /api/chat Worker route. The worker
// verifies the session is an admin account, loads the admin's saved profiles
// from Supabase, computes each chart, and lets the model answer with that
// context (Claude when ANTHROPIC_API_KEY is set, otherwise the free
// Groq → Workers AI chain). Responses stream in as plain text.
export default function ClaudeChat({ onClose }) {
  const [messages, setMessages] = useState([]); // {role: 'user'|'assistant', content}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError('');
    setInput('');
    const history = [...messages, { role: 'user', content: text }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setBusy(true);
    try {
      const session = await getSession();
      const res = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ messages: history }),
      });

      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      const paint = (t) => setMessages([...history, { role: 'assistant', content: t }]);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        paint(acc);
      }
      acc += decoder.decode();
      paint(acc || '(no response)');
    } catch (e) {
      setError(e.message || 'Something went wrong.');
      // Drop the empty assistant bubble but keep the user's question.
      setMessages(history);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-panel chat-panel" onClick={e => e.stopPropagation()}>
        <div className="pm-header">
          <h2 className="pm-title">✦ Ask AI <span className="ai-beta">admin</span></h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {messages.length > 0 && (
              <button
                className="btn btn-secondary"
                style={{ fontSize: '12px' }}
                onClick={() => { setMessages([]); setError(''); }}
                disabled={busy}
              >New chat</button>
            )}
            <button className="pm-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>Ask anything about the profiles saved in your account — Claude sees each
              saved chart (placements, nakshatras, current dasha), recorded life events, and notes.</p>
              <p className="chat-empty-examples">
                Try: “Compare Aditya and Priya for marriage compatibility” ·
                “Whose Sade Sati is active right now?” ·
                “What does Rahul’s current Antardasha suggest for career?”
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              <div className="chat-bubble">
                {m.content
                  ? m.content.split(/\n{2,}/).map((para, j) => <p key={j}>{para}</p>)
                  : <p className="chat-typing">Consulting the charts…</p>}
              </div>
            </div>
          ))}
        </div>

        {error && <div className="ai-error" style={{ margin: '0 0 8px' }}>⚠ {error}</div>}

        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={2}
            placeholder="Ask about any saved profile… (Enter to send, Shift+Enter for a new line)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
          />
          <button className="btn btn-primary chat-send" onClick={send} disabled={busy || !input.trim()}>
            {busy ? '…' : 'Send'}
          </button>
        </div>
        <p className="ai-disclaimer" style={{ margin: '6px 2px 0' }}>
          AI answers grounded in your saved profiles. For reflection, not advice.
        </p>
      </div>
    </div>
  );
}
