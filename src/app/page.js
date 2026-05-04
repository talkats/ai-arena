'use client';

import { useEffect, useMemo, useState } from 'react';
import { ENGINES, getDefaultModelSettings } from '@/lib/engines';
import SettingsPanel from '@/components/SettingsPanel';
import CompareTab from '@/components/CompareTab';
import CollabTab from '@/components/CollabTab';
import HistoryPanel from '@/components/HistoryPanel';
import CostDashboard from '@/components/CostDashboard';

const HISTORY_KEY = 'ai-arena-history-v1';
const USAGE_KEY = 'ai-arena-usage-v1';
const RATES_KEY = 'ai-arena-cost-rates-v1';
const MODELS_KEY = 'ai-arena-model-settings-v1';

export default function Home() {
  const [tab, setTab] = useState('compare');
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCosts, setShowCosts] = useState(false);
  const [history, setHistory] = useState([]);
  const [usage, setUsage] = useState([]);
  const [rates, setRates] = useState({});
  const [modelSettings, setModelSettingsState] = useState(() => getDefaultModelSettings());
  const [apiKeys, setApiKeys] = useState(() => (
    Object.fromEntries(ENGINES.map((engine) => [engine.id, '']))
  ));
  const [envKeys, setEnvKeys] = useState(() => (
    Object.fromEntries(ENGINES.map((engine) => [engine.id, false]))
  ));

  useEffect(() => {
    let active = true;

    fetch('/api/proxy')
      .then((resp) => resp.json())
      .then((data) => {
        if (!active) return;
        setEnvKeys(Object.fromEntries(
          ENGINES.map((engine) => [engine.id, Boolean(data.configured?.[engine.provider])])
        ));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (Array.isArray(stored)) setHistory(stored);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    try {
      const storedUsage = JSON.parse(localStorage.getItem(USAGE_KEY) || '[]');
      const storedRates = JSON.parse(localStorage.getItem(RATES_KEY) || '{}');
      const storedModels = JSON.parse(localStorage.getItem(MODELS_KEY) || '{}');
      if (Array.isArray(storedUsage)) setUsage(storedUsage);
      if (storedRates && typeof storedRates === 'object') setRates(storedRates);
      if (storedModels && typeof storedModels === 'object') {
        setModelSettingsState({ ...getDefaultModelSettings(), ...storedModels });
      }
    } catch {
      setUsage([]);
      setRates({});
    }
  }, []);

  const saveSession = (session) => {
    const nextSession = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      ...session,
    };

    setHistory((prev) => {
      const next = [nextSession, ...prev].slice(0, 50);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  const trackUsage = (record) => {
    setUsage((prev) => {
      const next = [record, ...prev].slice(0, 500);
      localStorage.setItem(USAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const updateRate = (engineId, field, value) => {
    setRates((prev) => {
      const next = {
        ...prev,
        [engineId]: {
          ...(prev[engineId] || {}),
          [field]: value,
        },
      };
      localStorage.setItem(RATES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const clearUsage = () => {
    localStorage.removeItem(USAGE_KEY);
    setUsage([]);
  };

  const setModelSettings = (nextSettings) => {
    const merged = { ...getDefaultModelSettings(), ...nextSettings };
    localStorage.setItem(MODELS_KEY, JSON.stringify(merged));
    setModelSettingsState(merged);
  };

  const availableKeys = useMemo(() => (
    Object.fromEntries(
      ENGINES.map((engine) => [engine.id, Boolean(apiKeys[engine.id] || envKeys[engine.id])])
    )
  ), [apiKeys, envKeys]);

  const connectedCount = ENGINES.filter((e) => availableKeys[e.id]).length;

  return (
    <div className="arena-app">
      <header className="arena-header">
        <div className="arena-title">
          <div className="logo-mark">A</div>
          AI Arena
        </div>
        <div className="header-right">
          <div className="engine-dots">
            {ENGINES.map((e) => (
              <span key={e.id} className="engine-dot" title={e.name}>
                <span className={`dot-indicator ${availableKeys[e.id] ? 'on' : 'off'}`} />
                {e.icon}
              </span>
            ))}
            <span style={{ marginLeft: 4 }}>
              {connectedCount}/{ENGINES.length}
            </span>
          </div>
          <button className="settings-toggle" onClick={() => setShowSettings(true)}>
            API Keys
          </button>
          <button className="settings-toggle" onClick={() => setShowHistory(true)}>
            History
          </button>
          <button className="settings-toggle" onClick={() => setShowCosts(true)}>
            Costs
          </button>
        </div>
      </header>

      <div className="tab-bar">
        <button
          className={`tab-btn ${tab === 'compare' ? 'active' : ''}`}
          onClick={() => setTab('compare')}
        >
          Compare
        </button>
        <button
          className={`tab-btn ${tab === 'collab' ? 'active' : ''}`}
          onClick={() => setTab('collab')}
        >
          Debate Club
        </button>
      </div>

      {tab === 'compare' ? (
        <CompareTab
          apiKeys={apiKeys}
          availableKeys={availableKeys}
          onSaveSession={saveSession}
          onTrackUsage={trackUsage}
          modelSettings={modelSettings}
        />
      ) : (
        <CollabTab
          apiKeys={apiKeys}
          availableKeys={availableKeys}
          onSaveSession={saveSession}
          onTrackUsage={trackUsage}
          modelSettings={modelSettings}
        />
      )}

      {showSettings && (
        <SettingsPanel
          apiKeys={apiKeys}
          envKeys={envKeys}
          modelSettings={modelSettings}
          setApiKeys={setApiKeys}
          setModelSettings={setModelSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showHistory && (
        <HistoryPanel
          history={history}
          onClose={() => setShowHistory(false)}
          onClear={clearHistory}
        />
      )}

      {showCosts && (
        <CostDashboard
          usage={usage}
          rates={rates}
          modelSettings={modelSettings}
          onRateChange={updateRate}
          onClear={clearUsage}
          onClose={() => setShowCosts(false)}
        />
      )}
    </div>
  );
}
