'use client';

import { useMemo, useState } from 'react';
import Rendered from './Rendered';

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function sessionToText(session) {
  const lines = [
    `AI Arena ${session.type === 'debate' ? 'Debate' : 'Compare'} Session`,
    `Saved: ${formatDate(session.createdAt)}`,
    `Question: ${session.question}`,
    `Models: ${(session.models || []).join(', ') || 'n/a'}`,
    '',
  ];

  if (session.finalAnswer) {
    lines.push('Final Answer', '', session.finalAnswer, '');
  }

  if (session.log?.length) {
    lines.push('Log', '');
    session.log.forEach((entry) => {
      lines.push(`[${entry.type || 'entry'}] ${entry.engineName || entry.title || ''}`);
      if (entry.round) lines.push(`Round: ${entry.round}`);
      lines.push('', entry.text || '', '---', '');
    });
  }

  if (session.responses) {
    lines.push('Responses', '');
    Object.entries(session.responses).forEach(([engine, response]) => {
      lines.push(`${engine}`, '', response?.text || response?.error || '', '---', '');
    });
  }

  return lines.join('\n');
}

export default function HistoryPanel({ history, onClose, onClear }) {
  const [selectedId, setSelectedId] = useState(history[0]?.id || null);
  const selected = useMemo(
    () => history.find((item) => item.id === selectedId) || history[0],
    [history, selectedId]
  );

  const exportSession = () => {
    if (!selected) return;
    const blob = new Blob([sessionToText(selected)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-arena-${selected.type}-${selected.createdAt}.txt`.replace(/[:.]/g, '-');
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Session History</h2>
          <button className="close-btn" onClick={onClose}>x</button>
        </div>

        {history.length === 0 ? (
          <div className="history-empty">
            Completed compare and debate sessions will appear here.
          </div>
        ) : (
          <div className="history-layout">
            <div className="history-list">
              {history.map((item) => (
                <button
                  key={item.id}
                  className={`history-item ${selected?.id === item.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span>{item.type === 'debate' ? 'Debate' : 'Compare'}</span>
                  <strong>{item.question}</strong>
                  <small>{formatDate(item.createdAt)}</small>
                </button>
              ))}
            </div>

            {selected && (
              <div className="history-detail">
                <div className="history-detail-head">
                  <div>
                    <span className="bubble-label">{selected.type}</span>
                    <h3>{selected.question}</h3>
                  </div>
                  <button className="ctrl-btn" onClick={exportSession}>Export</button>
                </div>

                {selected.finalAnswer && (
                  <div className="summary-bubble">
                    <span className="bubble-label">Final answer</span>
                    <Rendered text={selected.finalAnswer} />
                  </div>
                )}

                {selected.log?.length > 0 && (
                  <div className="debate-log">
                    {selected.log.map((entry, idx) => (
                      <div key={`${entry.time}-${idx}`} className={`debate-entry debate-entry-${entry.type || 'log'}`}>
                        <div className="debate-entry-head">
                          <span>{entry.title || entry.engineName || 'Entry'}</span>
                          <span>{entry.round ? `Round ${entry.round}` : ''}</span>
                        </div>
                        <Rendered text={entry.text} />
                      </div>
                    ))}
                  </div>
                )}

                {selected.responses && (
                  <div className="responses-grid">
                    {Object.entries(selected.responses).map(([engine, response]) => (
                      <div key={engine} className="response-card">
                        <div className="card-header">
                          <span className="eng-badge">{engine}</span>
                        </div>
                        <div className="card-body">
                          <Rendered text={response?.text || response?.error || ''} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="history-actions">
            <button className="ctrl-btn" onClick={onClear}>Clear History</button>
          </div>
        )}
      </div>
    </div>
  );
}
