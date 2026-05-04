'use client';

import { useState } from 'react';
import { ENGINES } from '@/lib/engines';

export default function SettingsPanel({
  apiKeys,
  envKeys,
  modelSettings = {},
  setApiKeys,
  setModelSettings,
  onClose,
}) {
  const [local, setLocal] = useState({ ...apiKeys });
  const [localModels, setLocalModels] = useState({ ...modelSettings });

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>API Keys</h2>
          <button className="close-btn" onClick={onClose}>x</button>
        </div>
        <p className="settings-note">
          Recommended: keep keys in .env.local on this computer. Browser keys are only
          a temporary session fallback and pass through the server proxy. Every provider
          is optional; connect only the services you actually have.
        </p>
        {ENGINES.map((eng) => (
          <div key={eng.id} className="key-row">
            <label style={{ color: eng.color }}>
              {eng.icon} {eng.name}
              {eng.requiresApiKey === false && <span className="env-pill">LOCAL</span>}
              {envKeys?.[eng.id] && <span className="env-pill">ENV</span>}
            </label>
            {eng.requiresApiKey === false ? (
              <div className="local-provider-note">
                Uses local Ollama. No API key is required.
              </div>
            ) : (
              <input
                type="password"
                placeholder={envKeys?.[eng.id] ? `${eng.name} key loaded from .env.local` : `${eng.name} API key...`}
                value={local[eng.id] || ''}
                onChange={(e) => setLocal({ ...local, [eng.id]: e.target.value })}
              />
            )}
            <select
              className="model-select"
              value={localModels[eng.id] || eng.defaultModel}
              onChange={(e) => setLocalModels({ ...localModels, [eng.id]: e.target.value })}
            >
              {eng.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.id})
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          className="save-btn"
          onClick={() => {
            setApiKeys(local);
            setModelSettings(localModels);
            onClose();
          }}
        >
          Save &amp; Close
        </button>
      </div>
    </div>
  );
}
