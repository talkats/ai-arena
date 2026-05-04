'use client';

import { useMemo } from 'react';
import { ENGINES, getModelLabel } from '@/lib/engines';
import { calculateRecordCost, formatCurrency } from '@/lib/costs';

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function toCsv(rows) {
  const headers = [
    'createdAt',
    'engineName',
    'provider',
    'mode',
    'phase',
    'inputTokens',
    'outputTokens',
    'estimatedCostUsd',
  ];

  return [
    headers.join(','),
    ...rows.map((row) => headers.map((key) => {
      const value = row[key] ?? '';
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')),
  ].join('\n');
}

export default function CostDashboard({ usage, rates, modelSettings = {}, onRateChange, onClear, onClose }) {
  const summary = useMemo(() => {
    const configuredModels = ENGINES.map((engine) => ({
      key: modelSettings[engine.id] || engine.defaultModel,
      engine,
      modelId: modelSettings[engine.id] || engine.defaultModel,
      modelName: getModelLabel(engine.id, modelSettings[engine.id] || engine.defaultModel),
    }));

    const byModel = Object.fromEntries(
      configuredModels.map(({ key, engine, modelId, modelName }) => [key, {
        engine,
        modelId,
        modelName,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      }])
    );

    usage.forEach((record) => {
      const key = record.modelId || record.engineId;
      if (!byModel[key]) {
        byModel[key] = {
          engine: {
            id: record.engineId,
            name: record.engineName,
            provider: record.provider,
          },
          modelId: key,
          modelName: record.modelName || key,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
        };
      }

      const bucket = byModel[key];
      bucket.calls += 1;
      bucket.inputTokens += record.inputTokens || 0;
      bucket.outputTokens += record.outputTokens || 0;
      bucket.cost += calculateRecordCost(record, rates[key]);
    });

    const rows = Object.values(byModel);
    const totals = rows.reduce((acc, row) => ({
      calls: acc.calls + row.calls,
      inputTokens: acc.inputTokens + row.inputTokens,
      outputTokens: acc.outputTokens + row.outputTokens,
      cost: acc.cost + row.cost,
    }), { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 });

    return { rows, totals };
  }, [usage, rates, modelSettings]);

  const exportCsv = () => {
    const rows = usage.map((record) => ({
      ...record,
      estimatedCostUsd: calculateRecordCost(record, rates[record.modelId || record.engineId]).toFixed(6),
    }));
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-arena-costs-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="cost-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Cost Dashboard</h2>
          <button className="close-btn" onClick={onClose}>x</button>
        </div>

        <p className="settings-note">
          Token counts are local estimates based on text length. Enter your current provider
          prices per 1M tokens to estimate spend. No cost data is sent anywhere.
        </p>

        <div className="cost-kpis">
          <div>
            <span>Total estimate</span>
            <strong>{formatCurrency(summary.totals.cost)}</strong>
          </div>
          <div>
            <span>Calls</span>
            <strong>{summary.totals.calls}</strong>
          </div>
          <div>
            <span>Input tokens</span>
            <strong>{summary.totals.inputTokens.toLocaleString()}</strong>
          </div>
          <div>
            <span>Output tokens</span>
            <strong>{summary.totals.outputTokens.toLocaleString()}</strong>
          </div>
        </div>

        <div className="cost-layout">
          <div className="cost-section">
            <h3>Provider Rates</h3>
            <div className="cost-rates">
              {ENGINES.map((engine) => (
                <div key={engine.id} className="rate-row">
                  <label style={{ color: engine.color }}>
                    {engine.name}
                    <small>{getModelLabel(engine.id, modelSettings[engine.id] || engine.defaultModel)}</small>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rates[modelSettings[engine.id] || engine.defaultModel]?.inputPerMillion || ''}
                    placeholder="Input $/1M"
                    onChange={(e) => onRateChange(modelSettings[engine.id] || engine.defaultModel, 'inputPerMillion', e.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rates[modelSettings[engine.id] || engine.defaultModel]?.outputPerMillion || ''}
                    placeholder="Output $/1M"
                    onChange={(e) => onRateChange(modelSettings[engine.id] || engine.defaultModel, 'outputPerMillion', e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="cost-section">
            <h3>Usage By Model</h3>
            <div className="cost-table">
              <div className="cost-table-head">
                <span>Model</span>
                <span>Calls</span>
                <span>Input</span>
                <span>Output</span>
                <span>Cost</span>
              </div>
              {summary.rows.map(({ engine, modelId, modelName, calls, inputTokens, outputTokens, cost }) => (
                <div key={modelId} className="cost-table-row">
                  <span>{engine.name}<small>{modelName}</small></span>
                  <span>{calls}</span>
                  <span>{inputTokens.toLocaleString()}</span>
                  <span>{outputTokens.toLocaleString()}</span>
                  <span>{formatCurrency(cost)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="cost-section cost-recent">
          <h3>Recent Calls</h3>
          {usage.length === 0 ? (
            <div className="history-empty">Run a compare or debate session to start tracking usage.</div>
          ) : (
            <div className="cost-table">
              {usage.slice(0, 12).map((record) => (
                <div key={record.id} className="cost-table-row recent-row">
                  <span>{formatDate(record.createdAt)}</span>
                  <span>{record.engineName}</span>
                  <span>{record.modelName || record.modelId || record.engineName}</span>
                  <span>{record.mode}</span>
                  <span>{(record.inputTokens + record.outputTokens).toLocaleString()} tokens</span>
                  <span>{formatCurrency(calculateRecordCost(record, rates[record.modelId || record.engineId]))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="history-actions">
          <button className="ctrl-btn" onClick={exportCsv} disabled={usage.length === 0}>Export CSV</button>
          <button className="ctrl-btn" onClick={onClear} disabled={usage.length === 0}>Clear Usage</button>
        </div>
      </div>
    </div>
  );
}
