import { useState } from 'react';
import { calculatePlanets, getJulianDate } from '../astrologyEngine';
import { buildChartPrompt } from '../promptBuilder';

// "Copy a ready-made AI prompt" card. Builds a prompt for the active chart
// (dasha, D1/D9/D10, live transits); the user appends their own question and
// pastes it into any AI chat.
export default function PromptGenerator({ birthDetails, natalChart, dashaData, vargaCharts }) {
  const [prompt, setPrompt] = useState('');
  const [question, setQuestion] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = () => {
    const now = new Date();
    const transit = calculatePlanets(getJulianDate(now));
    setPrompt(buildChartPrompt({
      birthDetails, natalChart, dashaData, vargaCharts, transitPlanets: transit.planets, now,
    }));
    setCopied(false);
  };

  const full = prompt + (question.trim() ? question.trim() : '[Type your question here]');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
    } catch {
      const ta = document.getElementById('prompt-gen-text');
      ta?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="ai-reading glass-subcard spacing-bottom">
      <div className="ai-reading-head">
        <h3 className="card-subtitle" style={{ margin: 0 }}>📋 AI Prompt Generator</h3>
        <p className="section-description" style={{ margin: '4px 0 0' }}>
          Builds a prompt with this chart's current Dasha, D1, D9, D10 and today's transits.
          Add your question, copy it, and paste it into any AI chat.
        </p>
      </div>

      <button className="btn btn-primary ai-generate" onClick={generate} disabled={!natalChart}>
        {prompt ? 'Refresh prompt (updates transits)' : 'Generate prompt'}
      </button>

      {prompt && (
        <>
          <label className="ai-hint" htmlFor="prompt-gen-q" style={{ display: 'block', marginTop: 12 }}>
            Your question
          </label>
          <textarea
            id="prompt-gen-q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            placeholder="e.g. How will the next 2 years look for my career?"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <textarea
            id="prompt-gen-text"
            readOnly
            value={full}
            rows={14}
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
          />
          <button className="btn btn-primary" onClick={copy} style={{ marginTop: 8 }}>
            {copied ? '✓ Copied' : 'Copy prompt'}
          </button>
        </>
      )}
    </div>
  );
}
