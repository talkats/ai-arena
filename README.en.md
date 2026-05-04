# AI Arena

AI Arena is a local web app for comparing, debating, continuing conversations,
and synthesizing answers from multiple AI models. Instead of asking one model
and hoping it is right, you can ask several models, compare their answers, let
them challenge each other, and keep a transparent log of the full process.

## What It Does

AI Arena can connect to multiple AI providers in one interface:

- Claude
- Gemini
- ChatGPT
- Grok
- Perplexity
- Local Ollama models

You do not need API keys for every provider. Every provider is optional, and the
app only uses the models that are actually configured.

Local Ollama engines do not require an API key. They use the local Ollama server
at `OLLAMA_HOST`, defaulting to `http://127.0.0.1:11434`.

## Modes

### Compare Mode

Compare Mode sends the same question to every connected model at the same time.
You can select exactly which connected engines participate, for example only
`Ollama Qwen3 32B` versus `Ollama DeepSeek R1 70B`. Each model answers
independently and does not see the other models' answers.

After the responses arrive, you can select one answer and continue chatting with
that model, or switch to another model while preserving context.

Use it for:

- Fast side-by-side model comparison.
- Checking differences in style, depth, and accuracy.
- Manually choosing the best response.
- Continuing a chat with the selected model.

### Debate Club

Debate Club lets the connected models discuss the question in rounds. Each model
can read the previous turns, add perspective, challenge weak assumptions, correct
mistakes, and build toward a stronger final answer.

The debate is limited to control token and credit usage:

- Default: 3 rounds.
- Maximum: 10 rounds.

Before sending the first question, you can adjust the debate setup:

- Choose the number of rounds.
- Enable or disable an outside judge.
- Pick which connected model acts as the judge.
- Select which connected models participate in the debate.
- Assign each participating model a role from the built-in list.
- Leave a model without a specific role.
- Write a custom role name and instructions when the preset roles are not enough.
- Paste shared references, user notes, project context, or skill instructions for the debate.
- Upload text-based reference files such as `.txt`, `.md`, `.json`, `.csv`, `.yaml`, or `.yml`.

When 3 or more models are connected, one model can be reserved as the outside
judge. If the participants do not reach a strong consensus, the judge decides or
creates a synthesized final answer.

After a debate ends, you can ask a follow-up question and continue the same
debate. The previous log is used as context, new turns are appended to the same
session, and a new consensus or judge decision can be produced.

During an active debate session, the same debate settings remain available. You
can change the number of rounds, switch the judge on or off, choose a different
judge, change the participating models, update shared references, or change each
model's role before the next follow-up. Settings changes are added to the
transparent debate log.

## Model Selection

The `API Keys` settings panel also lets you choose the active model for each
provider. The selected model is used for actual API calls and for cost
estimation.

Examples include:

- Claude Sonnet / Haiku
- Gemini Flash / Pro
- GPT-4o / GPT-4o mini / GPT-4.1
- Grok
- Perplexity Sonar
- Ollama Qwen3 32B
- Ollama DeepSeek R1 70B
- Ollama Gemma4

## Debate Roles

Debate Club assigns roles to make the discussion more useful:

- Research lead - focuses on facts, sources, and verification.
- Critical reviewer - challenges weak claims, assumptions, and risks.
- Synthesizer - combines the strongest points into one answer.
- Strategy lens - focuses on tradeoffs, decisions, and next steps.

Roles are configured before the debate starts. A custom role can be used for any
model when the built-in roles do not match the task, or a model can be left as a
general participant without a special role.

## Transparency And Logs

Every debate is shown as a transparent log:

- Who said what.
- Which round each turn belongs to.
- What the consensus check decided.
- Whether a judge was used.
- What the final answer was.
- What happened in follow-up questions.

The log can be exported as a text file.

## History

AI Arena keeps local browser history for completed sessions:

- Compare sessions.
- Debate sessions.
- Final answers.
- Full logs.
- Follow-up questions.

History is stored in the browser's localStorage. There is no database by
default.

## Cost Monitoring

AI Arena includes a local Cost Dashboard. It tracks estimated model calls from
Compare Mode and Debate Club, then groups usage by the actual selected model.

The dashboard shows:

- Estimated total spend.
- Number of model calls.
- Estimated input and output tokens.
- Usage by model.
- Recent calls.
- CSV export.

Prices are not hardcoded because provider pricing changes. Enter your current
rates as USD per 1M input tokens and USD per 1M output tokens for each selected
model.

The app cannot know how much money remains in your provider accounts. It only
estimates the cost of runs performed inside AI Arena. Token counts are local
estimates based on text length, so use them for cost awareness rather than exact
billing reconciliation.

## Agent API

AI Arena includes a headless API for AI agents and automations. An agent can send
a question, run a Debate Club session without opening the UI, and receive the
final answer plus the full log as JSON.

Endpoint:

```txt
POST /api/debate
```

Example:

```bash
curl -X POST http://localhost:3000/api/debate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "question": "What is the best pricing strategy for this product?",
    "rounds": 3,
    "participants": ["chatgpt", "claude", "perplexity"],
    "judge": "grok"
  }'
```

If `ARENA_AGENT_TOKEN` is set, agents must send it as a bearer token. This is
strongly recommended before exposing the app publicly, because debates consume
API credits.

## Sources And Web Access

Plain model API calls do not necessarily include live web browsing. Perplexity
Sonar is supported because it can return web-grounded answers with citations.

Other models are instructed to:

- Avoid inventing sources.
- Avoid inventing URLs.
- Clearly say what should be verified when current information is required.

Shared references are sent as prompt context to the selected providers during a
debate. They are useful for user preferences, project rules, business context,
style guides, and domain notes. Uploaded files are read locally in the browser
and then included as text context when the debate is sent.

## API Keys

The recommended setup is to keep provider keys in `.env.local` on your machine:

```env
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
OPENAI_API_KEY=
XAI_API_KEY=
PERPLEXITY_API_KEY=
OLLAMA_HOST=http://127.0.0.1:11434
ARENA_AGENT_TOKEN=
NEXT_IGNORE_INCORRECT_LOCKFILE=1
```

You can leave any provider empty. Every provider is optional.

Ollama models are local and do not use API keys. The Windows launcher uses
`OLLAMA_HOST=http://127.0.0.1:11434` by default and attempts to start `ollama
serve` if the Ollama CLI is available on `PATH`. If your Ollama models live in a
custom folder, set `OLLAMA_MODELS` in your own environment before launching the
app.

You can also enter temporary keys through the `API Keys` button in the UI. Keys
entered in the UI are only kept in the browser session.

## Local Start

The easiest way to run the app on Windows:

```txt
start-ai-arena.bat
```

It starts the app locally and opens:

```txt
http://localhost:3000
```

Manual start:

```bash
npm install
npm run dev
```

## Technology

The app is built with:

- Next.js
- React
- Next.js API routes
- localStorage for local session history
- localStorage for model settings and cost estimates

There is no database by default.

## Licensing And Dependencies

The project is intended to remain suitable for commercial use and sharing. The
direct dependencies are permissive:

- Next.js - MIT
- React - MIT
- React DOM - MIT

See:

```txt
THIRD_PARTY_LICENSES.md
```

Important: AI provider terms are separate from open-source package licenses.
Before selling or publicly hosting a service based on this app, review the terms
for OpenAI, Anthropic, Google, xAI, Perplexity, and any other connected provider.
