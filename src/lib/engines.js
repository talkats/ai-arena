export const ENGINES = [
  {
    id: 'claude',
    name: 'Claude',
    color: '#E8927C',
    icon: 'C',
    provider: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    color: '#7CACF8',
    icon: 'G',
    provider: 'google',
    defaultModel: 'gemini-2.0-flash',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    ],
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    color: '#8FD4A4',
    icon: 'O',
    provider: 'openai',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini' },
    ],
  },
  {
    id: 'grok',
    name: 'Grok',
    color: '#C8CCD4',
    icon: 'X',
    provider: 'xai',
    defaultModel: 'grok-4',
    models: [
      { id: 'grok-4', name: 'Grok 4' },
      { id: 'grok-3', name: 'Grok 3' },
      { id: 'grok-3-mini', name: 'Grok 3 mini' },
    ],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    color: '#31C7B7',
    icon: 'P',
    provider: 'perplexity',
    defaultModel: 'sonar-pro',
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro' },
      { id: 'sonar', name: 'Sonar' },
      { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro' },
    ],
  },
  {
    id: 'ollama-qwen3-32b',
    name: 'Ollama Qwen3 32B',
    color: '#D7B36A',
    icon: 'Q',
    provider: 'ollama',
    requiresApiKey: false,
    defaultModel: 'qwen3:32b',
    models: [
      { id: 'qwen3:32b', name: 'Qwen3 32B local' },
    ],
  },
  {
    id: 'ollama-deepseek-r1-70b',
    name: 'Ollama DeepSeek R1 70B',
    color: '#A7C957',
    icon: 'D',
    provider: 'ollama',
    requiresApiKey: false,
    defaultModel: 'deepseek-r1:70b',
    models: [
      { id: 'deepseek-r1:70b', name: 'DeepSeek R1 70B local' },
    ],
  },
  {
    id: 'ollama-gemma4',
    name: 'Ollama Gemma4',
    color: '#F0A35D',
    icon: 'L',
    provider: 'ollama',
    requiresApiKey: false,
    defaultModel: 'gemma4:latest',
    models: [
      { id: 'gemma4:latest', name: 'Gemma4 local' },
    ],
  },
];

export function getDefaultModelSettings() {
  return Object.fromEntries(ENGINES.map((engine) => [engine.id, engine.defaultModel]));
}

export function getEngineModel(engineId, modelSettings = {}) {
  const engine = ENGINES.find((e) => e.id === engineId);
  return modelSettings[engineId] || engine?.defaultModel || '';
}

export function getModelLabel(engineId, modelId) {
  const engine = ENGINES.find((e) => e.id === engineId);
  const model = engine?.models?.find((item) => item.id === modelId);
  return model?.name || modelId || engine?.defaultModel || '';
}

const CLIENT_REQUEST_TIMEOUT_MS = 90000;

export async function callEngine(engineId, apiKey, messages, systemPrompt, model) {
  const engine = ENGINES.find((e) => e.id === engineId);
  if (!engine) return { error: `Unknown engine: ${engineId}` };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        provider: engine.provider,
        engineId: engine.id,
        apiKey,
        messages,
        systemPrompt,
        model,
      }),
    });

    const raw = await resp.text();
    let data = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return { error: `Proxy returned a non-JSON response (${resp.status}).` };
    }

    if (!resp.ok) {
      return { error: data.error || `Proxy request failed (${resp.status}).` };
    }

    return data;
  } catch (err) {
    return {
      error: err.name === 'AbortError'
        ? `Request timed out after ${CLIENT_REQUEST_TIMEOUT_MS / 1000} seconds.`
        : err.message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
