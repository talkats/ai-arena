'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { ENGINES, callEngine, getEngineModel, getModelLabel } from '@/lib/engines';
import { makeUsageRecord } from '@/lib/costs';
import Rendered from './Rendered';

export default function CompareTab({
  apiKeys,
  availableKeys,
  modelSettings,
  onSaveSession,
  onTrackUsage,
}) {
  const [input, setInput] = useState('');
  const [rounds, setRounds] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [loading, setLoading] = useState({});
  const [followUp, setFollowUp] = useState('');
  const [selectedEngineIds, setSelectedEngineIds] = useState([]);
  const scrollRef = useRef(null);
  const savedRoundsRef = useRef(new Set());
  const activeEngines = useMemo(() => ENGINES.filter((e) => !!availableKeys[e.id]), [availableKeys]);
  const selectedEngines = useMemo(() => (
    activeEngines.filter((engine) => selectedEngineIds.includes(engine.id))
  ), [activeEngines, selectedEngineIds]);

  useEffect(() => {
    const activeIds = activeEngines.map((engine) => engine.id);

    setSelectedEngineIds((prev) => {
      const existing = prev.filter((id) => activeIds.includes(id));
      const missing = activeIds.filter((id) => !existing.includes(id));
      return [...existing, ...missing];
    });
  }, [activeEngines]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [rounds, activeConvo, loading]);

  useEffect(() => {
    rounds.forEach((round, idx) => {
      const roundEngines = round.engineIds?.length
        ? round.engineIds
        : selectedEngines.map((engine) => engine.id);
      const expectedCount = roundEngines.length;
      const responseCount = Object.keys(round.responses || {}).length;
      const allDone = expectedCount > 0 && responseCount >= expectedCount;

      if (!allDone || savedRoundsRef.current.has(idx)) return;

      savedRoundsRef.current.add(idx);
      onSaveSession?.({
        type: 'compare',
        question: round.question,
        models: roundEngines.map((id) => ENGINES.find((engine) => engine.id === id)?.name || id),
        responses: round.responses,
        finalAnswer: round.winner ? round.responses[round.winner]?.text : '',
      });
    });
  }, [rounds, selectedEngines, onSaveSession]);

  const toggleSelectedEngine = (engineId) => {
    setSelectedEngineIds((prev) => (
      prev.includes(engineId)
        ? prev.filter((id) => id !== engineId)
        : [...prev, engineId]
    ));
  };

  const askAll = async () => {
    if (!input.trim() || selectedEngines.length === 0) return;
    const q = input.trim();
    setInput('');
    const roundEngines = selectedEngines;
    const newRound = {
      question: q,
      responses: {},
      winner: null,
      engineIds: roundEngines.map((engine) => engine.id),
    };
    const idx = rounds.length;
    setRounds((prev) => [...prev, newRound]);
    setActiveConvo(null);

    const loadState = {};
    roundEngines.forEach((e) => (loadState[e.id] = true));
    setLoading(loadState);

    await Promise.allSettled(
      roundEngines.map(async (eng) => {
        const messages = [{ role: 'user', content: q }];
        const modelId = getEngineModel(eng.id, modelSettings);
        let result;

        try {
          result = await callEngine(eng.id, apiKeys[eng.id], messages, undefined, modelId);
        } catch (err) {
          result = { error: err.message || 'The model request failed.' };
        } finally {
          setLoading((prev) => ({ ...prev, [eng.id]: false }));
        }

        onTrackUsage?.(makeUsageRecord({
          engine: eng,
          modelId,
          modelName: getModelLabel(eng.id, modelId),
          mode: 'compare',
          phase: 'initial answer',
          messages,
          outputText: result?.text || result?.error || '',
        }));
        setRounds((prev) => {
          const copy = [...prev];
          copy[idx] = {
            ...copy[idx],
            responses: { ...copy[idx].responses, [eng.id]: result },
          };
          return copy;
        });
      })
    );
  };

  const pickWinner = (roundIdx, engineId) => {
    setRounds((prev) => {
      const copy = [...prev];
      copy[roundIdx] = { ...copy[roundIdx], winner: engineId };
      return copy;
    });
    const round = rounds[roundIdx];
    setActiveConvo({
      engineId,
      messages: [
        { role: 'user', content: round.question },
        { role: 'assistant', content: round.responses[engineId]?.text || '' },
      ],
    });
  };

  const continueWith = async (engineId) => {
    if (!followUp.trim()) return;
    const msg = followUp.trim();
    setFollowUp('');

    if (activeConvo && activeConvo.engineId === engineId) {
      const newMsgs = [...activeConvo.messages, { role: 'user', content: msg }];
      setActiveConvo({ engineId, messages: newMsgs });
      setLoading({ [engineId]: true });
      const modelId = getEngineModel(engineId, modelSettings);
      const result = await callEngine(engineId, apiKeys[engineId], newMsgs, undefined, modelId);
      const engine = ENGINES.find((e) => e.id === engineId);
      if (engine) {
        onTrackUsage?.(makeUsageRecord({
          engine,
          modelId,
          modelName: getModelLabel(engineId, modelId),
          mode: 'compare',
          phase: 'follow-up',
          messages: newMsgs,
          outputText: result.text || result.error || '',
        }));
      }
      setActiveConvo((prev) => ({
        ...prev,
        messages: [...prev.messages, { role: 'assistant', content: result.text || result.error || '' }],
      }));
      setLoading({});
    } else {
      const contextSummary = activeConvo
        ? `Context from previous conversation:\n${activeConvo.messages
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n')}\n\nNew question: ${msg}`
        : msg;
      const newMsgs = [{ role: 'user', content: contextSummary }];
      setActiveConvo({ engineId, messages: [] });
      setLoading({ [engineId]: true });
      const modelId = getEngineModel(engineId, modelSettings);
      const result = await callEngine(engineId, apiKeys[engineId], newMsgs, undefined, modelId);
      const engine = ENGINES.find((e) => e.id === engineId);
      if (engine) {
        onTrackUsage?.(makeUsageRecord({
          engine,
          modelId,
          modelName: getModelLabel(engineId, modelId),
          mode: 'compare',
          phase: 'switched follow-up',
          messages: newMsgs,
          outputText: result.text || result.error || '',
        }));
      }
      setActiveConvo({
        engineId,
        messages: [
          { role: 'user', content: msg },
          { role: 'assistant', content: result.text || result.error || '' },
        ],
      });
      setLoading({});
    }
  };

  return (
    <div className="tab-content">
      <div className="messages-area" ref={scrollRef}>
        {rounds.length === 0 && !activeConvo && (
          <div className="empty-state">
            <div className="empty-icon">VS</div>
            <h3>Compare Mode</h3>
            <p>
              Ask one question and compare every connected model side by side.
            </p>
          </div>
        )}

        {rounds.map((round, ri) => (
          <div key={ri} className="round-block">
            <div className="user-bubble">
              <span className="bubble-label">You</span>
              <Rendered text={round.question} />
            </div>
            <div className="responses-grid">
              {activeEngines.map((eng) => {
                if (round.engineIds?.length && !round.engineIds.includes(eng.id)) return null;
                const resp = round.responses[eng.id];
                const isWinner = round.winner === eng.id;
                const isLoading = !resp && loading[eng.id];
                return (
                  <div
                    key={eng.id}
                    className={`response-card ${isWinner ? 'winner' : ''}`}
                    style={{ '--eng-color': eng.color }}
                  >
                    <div className="card-header">
                      <span className="eng-badge" style={{ background: eng.color }}>
                        {eng.icon} {eng.name}
                      </span>
                      {isWinner && <span className="winner-tag">SELECTED</span>}
                    </div>
                    <div className="card-body">
                      {isLoading ? (
                        <div className="loading-dots"><span /><span /><span /></div>
                      ) : resp?.error ? (
                        <div className="error-msg">Error: {resp.error}</div>
                      ) : (
                        <Rendered text={resp?.text} />
                      )}
                    </div>
                    {!round.winner && resp?.text && (
                      <button className="pick-btn" onClick={() => pickWinner(ri, eng.id)}>
                        Pick this one
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {activeConvo && activeConvo.messages.length > 0 && (
          <div className="convo-block">
            <div className="convo-header">
              <span
                className="eng-badge"
                style={{ background: ENGINES.find((e) => e.id === activeConvo.engineId)?.color }}
              >
                {ENGINES.find((e) => e.id === activeConvo.engineId)?.icon}{' '}
                Continuing with {ENGINES.find((e) => e.id === activeConvo.engineId)?.name}
              </span>
            </div>
            {activeConvo.messages.slice(2).map((msg, mi) => (
              <div
                key={mi}
                className={msg.role === 'user' ? 'user-bubble' : 'assistant-bubble'}
                style={{ '--eng-color': ENGINES.find((e) => e.id === activeConvo.engineId)?.color }}
              >
                <span className="bubble-label">
                  {msg.role === 'user'
                    ? 'You'
                    : ENGINES.find((e) => e.id === activeConvo.engineId)?.name}
                </span>
                <Rendered text={msg.content} />
              </div>
            ))}
            {loading[activeConvo.engineId] && (
              <div className="assistant-bubble">
                <div className="loading-dots"><span /><span /><span /></div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="input-area">
        {!activeConvo ? (
          <>
            <div className="compare-settings">
              <div className="settings-subhead">
                <strong>Compare engines</strong>
                <span>Select exactly who answers this prompt.</span>
              </div>
              <div className="participant-grid">
                {activeEngines.map((eng) => {
                  const checked = selectedEngineIds.includes(eng.id);

                  return (
                    <label
                      key={eng.id}
                      className={`participant-chip ${checked ? 'active' : ''}`}
                      style={{ '--eng-color': eng.color }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelectedEngine(eng.id)}
                      />
                      <span>{eng.icon}</span>
                      {eng.name}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="input-row">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask selected models..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    askAll();
                  }
                }}
                rows={2}
              />
              <button
                className="send-btn"
                onClick={askAll}
                disabled={!input.trim() || selectedEngines.length === 0}
              >
                Compare
              </button>
            </div>
          </>
        ) : (
          <div className="follow-up-area">
            <div className="engine-switcher">
              {activeEngines.map((eng) => (
                <button
                  key={eng.id}
                  className={`switch-btn ${activeConvo.engineId === eng.id ? 'active' : ''}`}
                  style={{ '--eng-color': eng.color }}
                  onClick={() => continueWith(eng.id)}
                  title={
                    activeConvo.engineId === eng.id
                      ? 'Continue with ' + eng.name
                      : 'Switch to ' + eng.name
                  }
                >
                  {eng.icon} {eng.name}
                </button>
              ))}
              <button className="switch-btn new-compare" onClick={() => setActiveConvo(null)}>
                New Compare
              </button>
            </div>
            <div className="input-row">
              <textarea
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Ask a follow-up or switch models..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    continueWith(activeConvo.engineId);
                  }
                }}
                rows={2}
              />
              <button
                className="send-btn"
                onClick={() => continueWith(activeConvo.engineId)}
                disabled={!followUp.trim()}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
