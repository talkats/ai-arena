# AI Arena

Compare AI models or run a transparent debate club where models discuss a
question, log every turn, and produce a final answer or synthesis.

## Features

### Compare Mode

Ask one question and get answers from selected connected models. You can compare
all engines, or choose a focused matchup such as Qwen vs DeepSeek. Pick the
strongest answer and continue with that model.

### Debate Club

Ask a question and connected models debate for a configurable number of rounds.
The default is 3 rounds, with an optional maximum of 10. The full discussion is
shown in a transparent log and can be exported.

Before and during a debate you can choose:

- Which connected engines participate.
- How many rounds to run.
- Whether to use an outside judge.
- Which engine acts as judge.
- A role for each participant, no specific role, or a custom role.
- Shared references, project context, user notes, or text files for the models.

If a judge is enabled and the participants do not reach a good consensus, the
judge decides or creates a synthesized final answer.

### Local Ollama Support

AI Arena includes local Ollama engines without API keys:

- `qwen3:32b`
- `deepseek-r1:70b`
- `gemma4:latest`

Ollama uses `OLLAMA_HOST`, defaulting to `http://127.0.0.1:11434`. Install
Ollama and pull the models you want before using local engines.

## API Keys

All provider keys are optional. You only need keys for the models you want to
use.

- Compare mode works with 1 or more connected models.
- Debate Club requires at least 2 connected participant models.
- Debate Club uses an outside judge only when 3 or more models are connected.

Recommended local setup:

```bash
cp .env.example .env.local
```

Then fill only the keys you have:

```env
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
OPENAI_API_KEY=
XAI_API_KEY=
PERPLEXITY_API_KEY=
OLLAMA_HOST=http://127.0.0.1:11434
ARENA_AGENT_TOKEN=
```

Keys in `.env.local` stay on the server side. The in-app API Keys panel is only
a temporary browser-session fallback.

`ARENA_AGENT_TOKEN` is optional for local use, but recommended before exposing
the app publicly. When set, automated agents must send it as a bearer token.

## Agent API

Agents and automation tools can run the debate center without opening the UI:

```bash
curl -X POST http://localhost:3000/api/debate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARENA_AGENT_TOKEN" \
  -d '{
    "question": "What should our launch pricing strategy be?",
    "rounds": 3,
    "participants": ["chatgpt", "claude", "perplexity"],
    "judge": "grok"
  }'
```

Request fields:

- `question` is required.
- `rounds` is optional. Default is 3, maximum is 10.
- `participants` is optional. If omitted, all configured models are used.
- `judge` is optional. If omitted and 3+ models are configured, the last model is reserved as judge.

The response is JSON with:

- `finalAnswer`
- `log`
- `participants`
- `judge`
- `decidedBy`
- `consensus`

## Web Sources

Plain model API calls do not automatically include live web browsing. Perplexity
Sonar is included because it can return web-grounded responses with citations.
Other models are prompted to list sources or verification targets and not invent
URLs.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000.

On Windows you can also run:

```txt
start-ai-arena.bat
```

The launcher starts the Next.js dev server and tries to start `ollama serve` if
the Ollama CLI is available on `PATH`.

## More Docs

- [English README](./README.en.md)
- [Hebrew README](./README.he.md)
- [Project memory / implementation log](./PROJECT_MEMORY.md)

## Licensing

The app currently uses a small dependency set: Next.js, React, and React DOM.
These direct dependencies are MIT licensed. See
[`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for the dependency
license policy and notes.

Provider API terms are separate from open-source package licenses. Review the
commercial terms of each connected AI provider before selling a hosted service.
