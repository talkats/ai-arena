import { ENGINES } from './engines';

const SERVER_REQUEST_TIMEOUT_MS = 90000;

const PROVIDER_CONFIGS = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    buildHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }),
    buildBody: (messages, systemPrompt, model) => ({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages,
    }),
  },
  google: {
    url: (apiKey, model) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`,
    buildHeaders: () => ({
      'Content-Type': 'application/json',
    }),
    buildBody: (messages, systemPrompt) => ({
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    }),
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    buildHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }),
    buildBody: (messages, systemPrompt, model) => ({
      model: model || 'gpt-4o',
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages,
      ],
    }),
  },
  xai: {
    url: 'https://api.x.ai/v1/chat/completions',
    buildHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }),
    buildBody: (messages, systemPrompt, model) => ({
      model: model || 'grok-4',
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages,
      ],
    }),
  },
  perplexity: {
    url: 'https://api.perplexity.ai/v1/sonar',
    buildHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }),
    buildBody: (messages, systemPrompt, model) => ({
      model: model || 'sonar-pro',
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages,
      ],
      disable_search: false,
    }),
  },
  ollama: {
    url: () => `${process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'}/api/chat`,
    timeoutMs: 300000,
    local: true,
    buildHeaders: () => ({
      'Content-Type': 'application/json',
    }),
    buildBody: (messages, systemPrompt, model) => ({
      model,
      stream: false,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages,
      ],
    }),
  },
};

export const ENV_KEYS = {
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  openai: 'OPENAI_API_KEY',
  xai: 'XAI_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
};

export function getConfiguredProviders() {
  return {
    ...Object.fromEntries(
      Object.entries(ENV_KEYS).map(([provider, envName]) => [provider, Boolean(process.env[envName])])
    ),
    ollama: true,
  };
}

export function getConfiguredEngines() {
  const configured = getConfiguredProviders();
  return ENGINES.filter((engine) => configured[engine.provider]);
}

export function getApiKey(provider, suppliedKey) {
  if (PROVIDER_CONFIGS[provider]?.local) return 'local';
  return suppliedKey || process.env[ENV_KEYS[provider]] || '';
}

export function extractResponse(provider, data) {
  switch (provider) {
    case 'anthropic': {
      if (data.error) return { error: data.error.message };
      const text = data.content?.map((c) => c.text || '').join('') || '';
      return { text };
    }
    case 'google': {
      if (data.error) return { error: data.error.message };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      return { text };
    }
    case 'openai':
    case 'xai': {
      if (data.error) return { error: data.error.message };
      const text = data.choices?.[0]?.message?.content || '';
      return { text };
    }
    case 'perplexity': {
      if (data.error) return { error: data.error.message };
      const text = data.choices?.[0]?.message?.content || '';
      const citations = data.citations || [];
      const searchResults = data.search_results || [];
      const sourceLines = searchResults.map((result, idx) => {
        const title = result.title || `Source ${idx + 1}`;
        const url = result.url || citations[idx] || '';
        const date = result.date ? ` (${result.date})` : '';
        return `- ${title}${date}${url ? `: ${url}` : ''}`;
      });
      const citationLines = citations
        .filter((url) => !sourceLines.some((line) => line.includes(url)))
        .map((url) => `- ${url}`);
      const sources = [...sourceLines, ...citationLines];

      return {
        text: sources.length
          ? `${text}\n\n### Sources\n${sources.join('\n')}`
          : text,
      };
    }
    case 'ollama': {
      if (data.error) return { error: data.error };
      const text = data.message?.content || data.response || '';
      return { text };
    }
    default:
      return { error: 'Unknown provider' };
  }
}

function normalizeProviderError(engine, provider, model, status, data, raw) {
  const message = data?.error?.message
    || data?.error
    || data?.message
    || raw?.slice(0, 400)
    || 'Unknown provider error';

  return `${engine.name}/${model || engine.defaultModel} ${provider} API error ${status}: ${message}`;
}

export async function callEngineServer(engineId, messages, options = {}) {
  const engine = ENGINES.find((item) => item.id === engineId);
  if (!engine) return { error: `Unknown engine: ${engineId}` };

  const config = PROVIDER_CONFIGS[engine.provider];
  if (!config) return { error: `Unknown provider: ${engine.provider}` };

  const apiKey = getApiKey(engine.provider, options.apiKey);
  if (!apiKey) {
    return { error: `Missing API key. Add ${ENV_KEYS[engine.provider]} to .env.local.` };
  }

  const effectiveModel = options.model || engine.defaultModel;
  const url = typeof config.url === 'function'
    ? config.url(apiKey, effectiveModel)
    : config.url;
  const headers = config.buildHeaders(apiKey);
  const body = config.buildBody(messages, options.systemPrompt, effectiveModel);

  const controller = new AbortController();
  const timeoutMs = config.timeoutMs || SERVER_REQUEST_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    const raw = await resp.text();
    let data = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return {
        error: `${engine.name}/${effectiveModel} returned a non-JSON response (${resp.status}).`,
      };
    }

    if (!resp.ok) {
      return {
        error: normalizeProviderError(
          engine,
          engine.provider,
          effectiveModel,
          resp.status,
          data,
          raw
        ),
      };
    }

    const extracted = extractResponse(engine.provider, data);
    if (!extracted.text && !extracted.error) {
      return { error: `${engine.name}/${effectiveModel} returned an empty response.` };
    }

    return extracted;
  } catch (err) {
    return {
      error: err.name === 'AbortError'
        ? `${engine.name}/${effectiveModel} timed out after ${timeoutMs / 1000} seconds.`
        : `${engine.name}/${effectiveModel} request failed: ${err.message}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
