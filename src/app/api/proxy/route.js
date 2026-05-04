import { NextResponse } from 'next/server';
import {
  callEngineServer,
  ENV_KEYS,
  getConfiguredProviders,
  getApiKey,
} from '@/lib/serverEngines';
import { ENGINES } from '@/lib/engines';

export async function GET() {
  return NextResponse.json({
    configured: getConfiguredProviders(),
  });
}

export async function POST(request) {
  try {
    const { provider, engineId, apiKey, messages, systemPrompt, model } = await request.json();

    if (!provider || !messages) {
      return NextResponse.json({ error: 'Missing required fields: provider, messages' }, { status: 400 });
    }

    const engine = ENGINES.find((item) => item.id === engineId)
      || ENGINES.find((item) => item.provider === provider);
    if (!engine) {
      return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }

    if (!getApiKey(provider, apiKey)) {
      return NextResponse.json({
        error: `Missing API key. Add ${ENV_KEYS[provider]} to .env.local or enter a key in the UI.`,
      }, { status: 400 });
    }

    const result = await callEngineServer(engine.id, messages, {
      apiKey,
      systemPrompt,
      model,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
