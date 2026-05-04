export function estimateTokensFromText(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(String(text).length / 4));
}

export function estimateTokensFromMessages(messages = []) {
  return messages.reduce((total, message) => (
    total + estimateTokensFromText(`${message.role || 'user'}: ${message.content || ''}`)
  ), 0);
}

export function makeUsageRecord({ engine, modelId, modelName, mode, phase, messages, outputText }) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    engineId: engine.id,
    engineName: engine.name,
    modelId: modelId || engine.defaultModel || '',
    modelName: modelName || modelId || engine.defaultModel || '',
    provider: engine.provider,
    mode,
    phase,
    inputTokens: estimateTokensFromMessages(messages),
    outputTokens: estimateTokensFromText(outputText),
    estimated: true,
  };
}

export function calculateRecordCost(record, rate) {
  const inputRate = Number(rate?.inputPerMillion) || 0;
  const outputRate = Number(rate?.outputPerMillion) || 0;

  return (
    (record.inputTokens / 1_000_000) * inputRate +
    (record.outputTokens / 1_000_000) * outputRate
  );
}

export function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value >= 1 ? 2 : 4,
    maximumFractionDigits: value >= 1 ? 2 : 4,
  }).format(value || 0);
}
