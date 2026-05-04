# AI Arena Project Memory

This document is a working memory log for future AI coding agents, including
Codex and Claude Code. Keep it updated whenever the app architecture, workflows,
or important implementation decisions change.

## Project Summary

AI Arena is a local Next.js app for comparing and debating answers from multiple
AI models. The product goal is to make multi-model reasoning transparent:

- Compare answers side by side.
- Let models debate in rounds.
- Preserve a full log of who said what.
- Produce a final answer or synthesis.
- Allow headless agent access through an API.

The app is intended to remain commercially usable, with permissive open-source
dependencies and local/server-side API key handling.

## Initial State

The original project was a small Next.js app with:

- `CompareTab.js` for side-by-side answers from Claude, Gemini, and ChatGPT.
- `CollabTab.js` for basic model collaboration.
- `SettingsPanel.js` for browser-session API key entry.
- `src/app/api/proxy/route.js` as a provider proxy.
- `src/lib/engines.js` with engine definitions.

The original README and UI had broken encoding characters in several places.

## Major Updates Made

### 1. Debate Club

The old collaboration flow was replaced with a more explicit Debate Club:

- User asks a question.
- Connected models debate in rounds.
- Each model sees the previous discussion.
- The app logs each turn.
- A consensus check runs at the end.
- If consensus is weak and a judge is available, the judge decides.
- Final answer can be a synthesis, not only one winning model.

Files involved:

- `src/components/CollabTab.js`
- `src/app/globals.css`

Current debate limits:

- Default rounds: `3`
- Maximum rounds: `10`

### 2. Judge Model

If 3 or more models are connected, the last connected model is reserved as a
non-participating judge.

Current behavior:

- 2 connected models: debate only, no judge.
- 3+ connected models: last model becomes judge, others participate.

### 3. Debate Roles

Debate participants now receive rotating roles:

- `Research lead`
- `Critical reviewer`
- `Synthesizer`
- `Strategy lens`

These roles are injected into the debate prompt and displayed in the debate log.

Main file:

- `src/components/CollabTab.js`

### 4. Sources And Verification Policy

Prompts now tell models:

- Do not invent citations, URLs, papers, dates, prices, or current events.
- List sources or verification targets when relevant.
- Say what needs to be checked online if live verification is unavailable.
- Perplexity Sonar can return web-grounded citations when configured.

This is prompt-level behavior. Most plain model APIs do not provide live web
browsing by default.

### 5. Additional Engines

Originally supported:

- Claude
- Gemini
- ChatGPT

Added:

- Grok through xAI
- Perplexity through Sonar API

Engine definitions:

- `src/lib/engines.js`

Server-side provider logic:

- `src/lib/serverEngines.js`

### 6. API Keys And Environment Variables

API keys are optional. The app only uses configured models.

Supported environment variables:

```env
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
OPENAI_API_KEY=
XAI_API_KEY=
PERPLEXITY_API_KEY=
ARENA_AGENT_TOKEN=
NEXT_IGNORE_INCORRECT_LOCKFILE=1
```

Recommended storage:

- `.env.local` on the local computer or server.

Fallback:

- Temporary browser-session keys via the `API Keys` modal.

Important:

- `.env.local` is ignored by git.
- `.env.example` documents the available variables.

### 7. Server Engine Abstraction

Model calling logic was moved into:

- `src/lib/serverEngines.js`

This keeps provider details shared between:

- UI proxy route: `src/app/api/proxy/route.js`
- Headless debate route: `src/app/api/debate/route.js`

### 8. Agent API

Added a headless debate endpoint for AI agents and automation tools:

```txt
POST /api/debate
```

Purpose:

- Let external agents send a question.
- Run the Debate Club without opening the GUI.
- Return JSON containing final answer, log, participants, judge, and consensus.

Security:

- If `ARENA_AGENT_TOKEN` is set, requests must include:

```http
Authorization: Bearer <token>
```

Main file:

- `src/app/api/debate/route.js`

Example request:

```bash
curl -X POST http://localhost:3000/api/debate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "question": "What is the best pricing strategy?",
    "rounds": 3,
    "participants": ["chatgpt", "claude", "perplexity"],
    "judge": "grok"
  }'
```

### 9. History Panel

Added local session history:

- Saved to browser `localStorage`.
- Stores recent Compare and Debate sessions.
- Shows final answers and logs.
- Allows export of a selected session to text.

Main files:

- `src/components/HistoryPanel.js`
- `src/app/page.js`

Current storage key:

```txt
ai-arena-history-v1
```

Current limit:

- Last 50 sessions.

### 10. Compare Mode Cleanup

Compare Mode was cleaned up:

- Removed broken encoding text.
- Preserves side-by-side answers.
- Saves completed compare sessions to History.
- Supports all configured engines.

Main file:

- `src/components/CompareTab.js`

### 11. GUI Modernization

The UI received a 2026-style polish pass:

- More refined dark palette.
- Modern header.
- Better tabs.
- Cleaner cards.
- Better input area.
- More readable debate logs.
- Mobile improvements.
- No new UI library dependencies were added.

Main file:

- `src/app/globals.css`

Design constraint:

- Avoid adding dependencies unless needed and license-reviewed.

### 12. Windows Launcher

Created:

- `start-ai-arena.bat`

Purpose:

- Start the app with one double-click.
- Check Node.js.
- Run `npm install` if `node_modules` is missing.
- Create `.env.local` from `.env.example` if missing.
- Close old AI Arena dev servers.
- Clear `.next`.
- Start Next on `http://localhost:3000`.
- Open the browser.

Important:

- Keep the BAT window open while using the app.
- The BAT sets `NEXT_IGNORE_INCORRECT_LOCKFILE=1`.

### 13. Documentation

Added or updated:

- `README.md`
- `README.he.md`
- `README.en.md`
- `THIRD_PARTY_LICENSES.md`
- `PROJECT_MEMORY.md`

`README.he.md` and `README.en.md` are the main user-facing docs in Hebrew and
English.

`THIRD_PARTY_LICENSES.md` documents dependency license policy.

### 14. Cost Monitoring Dashboard

Added a local Cost Dashboard for API cost visibility.

Purpose:

- Track estimated model calls across Compare and Debate Club.
- Estimate input and output tokens locally from text length.
- Let users enter provider/model rates as USD per 1M input and output tokens.
- Show total estimated spend, calls, token totals, per-model usage, and recent calls.
- Export usage records as CSV.

Important implementation details:

- No provider pricing is hardcoded because prices change often.
- Rates are stored in browser `localStorage`.
- Rates are keyed by `modelId`, not only provider/engine.
- Users can choose the active model for each engine from API Keys settings.
- Usage records include `modelId` and `modelName`.
- Usage is stored in browser `localStorage`.
- Token counts are estimates, not provider-billed exact numbers.

Files:

- `src/components/CostDashboard.js`
- `src/lib/costs.js`
- `src/app/page.js`
- `src/components/CompareTab.js`
- `src/components/CollabTab.js`

Storage keys:

```txt
ai-arena-usage-v1
ai-arena-cost-rates-v1
ai-arena-model-settings-v1
```

Current retained usage limit:

- Last 500 model calls.

### 15. Follow-up Conversations

Added continuation flows so users can keep working after an initial answer.

Compare Mode:

- Already supported continuing with a selected model.
- Follow-up calls now use the selected model setting and are tracked in usage.

Debate Club:

- Added a follow-up input after a debate session exists.
- User can ask a follow-up and continue the same debate instead of starting over.
- The previous log is used as context.
- New follow-up turns are appended to the existing log.
- Consensus check and judge can run again after the follow-up rounds.
- Usage and estimated costs are tracked for follow-up rounds.

Main file:

- `src/components/CollabTab.js`

## Current File Map

Important files:

```txt
src/app/page.js
src/app/globals.css
src/app/api/proxy/route.js
src/app/api/debate/route.js
src/components/CompareTab.js
src/components/CollabTab.js
src/components/HistoryPanel.js
src/components/CostDashboard.js
src/components/Rendered.js
src/components/SettingsPanel.js
src/lib/engines.js
src/lib/serverEngines.js
src/lib/costs.js
start-ai-arena.bat
.env.example
.env.local
README.he.md
README.en.md
THIRD_PARTY_LICENSES.md
PROJECT_MEMORY.md
```

## Known Operational Notes

### Port Conflicts

The app should run on:

```txt
http://localhost:3000
```

Previous issue:

- Old dev servers sometimes stayed alive.
- Next would move to port `3001`.
- Browser still pointed to `3000`.
- This caused apparent GUI/server errors.

Mitigation:

- `start-ai-arena.bat` now closes old AI Arena dev servers before starting.

### Next Cache

Previous issue:

- `.next` cache sometimes caused server/runtime errors after code changes.

Mitigation:

- `start-ai-arena.bat` deletes `.next` before starting dev.

### Lockfile / SWC Warning

Previous issue:

- Next printed warnings about missing SWC dependencies and failed to patch the
  lockfile.

Mitigation:

- `.env.local` and BAT set:

```env
NEXT_IGNORE_INCORRECT_LOCKFILE=1
```

Build currently passes.

## Licensing Policy

The user wants the app to remain shareable and commercially usable.

Current direct dependencies:

- `next` - MIT
- `react` - MIT
- `react-dom` - MIT

Allowed dependency licenses:

- MIT
- Apache-2.0
- BSD-2-Clause
- BSD-3-Clause
- ISC
- 0BSD

Avoid without explicit review:

- GPL
- AGPL
- LGPL
- SSPL
- BUSL
- Commons Clause

Provider API terms are separate from open-source package licenses.

## Future Improvement Ideas

Potential next steps:

- Central search layer with Brave, Tavily, SerpAPI, or similar.
- Streaming model responses.
- Cost estimation before each debate.
- Token and budget caps.
- Saved named projects/workspaces.
- Better job status UI for `/api/debate`.
- PDF/DOCX export.
- Ollama or LM Studio support for local models.
- Admin screen for provider/model selection.
- Role customization per debate.
- More robust persistent storage instead of localStorage.
- Exact provider usage accounting if APIs expose reliable token usage.

## Guidance For Future Agents

When editing this project:

1. Preserve the optional API key model. Never require all providers.
2. Keep `.env.local` out of git.
3. Avoid adding non-permissive dependencies.
4. Keep Debate Club transparent: every model turn should be logged.
5. Keep Agent API compatible with automation tools.
6. Prefer adding shared provider logic to `src/lib/serverEngines.js`.
7. If GUI looks broken, first check port conflicts and `.next` cache.
8. After significant changes, run:

```bash
npm run build
```

9. For local user testing, use:

```txt
start-ai-arena.bat
```

10. Update this file when making meaningful architecture or workflow changes.

## 2026-05-03 - Debate Setup Controls And API Failure Visibility

Added explicit Debate Club configuration before sending the first prompt:

- Round count remains configurable from 1 to 10, defaulting to 3.
- The user can enable or disable an outside judge.
- When a judge is enabled, the user can choose which connected engine acts as judge.
- Participant engines are derived from connected engines minus the selected judge.
- Each participant can use a built-in role or a custom role with a custom name and instructions.
- Debate session metadata now records the selected role names in the session log context.

Also improved provider failure handling for Compare Mode and shared API calls:

- Client calls to `/api/proxy` now have a 90 second timeout.
- Proxy responses are parsed defensively so non-JSON errors become visible UI errors.
- Server provider calls now return clear provider/model/status errors instead of throwing or hanging.
- Compare Mode uses `Promise.allSettled` and clears loading per engine, so one failed provider should not hide the other results or leave a card spinning forever.

Verification:

```bash
npm run build
```

Result: build passed.

## 2026-05-04 - Compare Engine Selection

Added per-run engine selection to Compare Mode:

- Compare now shows a `Compare engines` selector before the prompt.
- Users can choose exactly which connected engines answer, including local Ollama engines.
- Example supported workflow: `Ollama Qwen3 32B` vs `Ollama DeepSeek R1 70B`.
- Each compare round stores its `engineIds`, so older rounds keep showing only the engines that participated even if the selection changes later.
- History saving uses the round's selected engines instead of all connected engines.

Verification:

```bash
npm run build
```

Result: build passed.

## 2026-05-04 - Local Ollama Engines

Added local Ollama support as first-class Arena engines:

- `ollama-qwen3-32b` -> `qwen3:32b`
- `ollama-deepseek-r1-70b` -> `deepseek-r1:70b`
- `ollama-gemma4` -> `gemma4:latest`

Implementation notes:

- Each Ollama model is represented as a separate `ENGINE`, so multiple local models can participate in the same Compare or Debate session.
- Ollama engines use provider `ollama`, `requiresApiKey: false`, and show `LOCAL` in the settings panel.
- Server calls use `OLLAMA_HOST` or default to `http://127.0.0.1:11434`.
- Calls go to `/api/chat` with `stream: false`.
- Ollama timeout is 300 seconds because large local models, especially 70B, can be slow.
- `/api/proxy` now accepts `engineId` so providers with multiple engine entries, such as Ollama, resolve to the correct model.
- `start-ai-arena.bat` uses `OLLAMA_HOST=http://127.0.0.1:11434` by default and attempts to start `ollama serve` when the Ollama CLI is available on `PATH`.

Local verification:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags"
```

Example detected models from the original development machine:

- `qwen3:32b` - ~20 GB
- `deepseek-r1:70b` - ~42 GB
- `gemma4:latest` - ~9.6 GB

Build verification:

```bash
npm run build
```

Result: build passed.

## 2026-05-03 - Optional Debate Roles And Dropdown Contrast

Added a `No specific role` option for Debate Club participants:

- A participant can now join as a general model without a predefined debate angle.
- The prompt explicitly tells that model it has no special role.
- Session metadata and role display show `No specific role` instead of a generic participant fallback.

Fixed dropdown contrast:

- Added explicit dark background and light text for `option` elements in judge, role, and model selects.
- This avoids white-on-white or very low contrast dropdown menus in browsers that paint native select popups with light defaults.

## 2026-05-03 - Participant Selection And Shared Debate Context

Added more flexible Debate Club setup:

- Connected engines can now be selected individually as participants.
- A debate can use only part of the configured providers, such as 2 of 3 or 2 of 5.
- Judge selection is independent from participant selection. A selected judge is reserved and disabled in the participant picker.
- The existing minimum of 2 active participants still applies.

Added shared references / skills for debates:

- Users can paste shared context for the debate, including user profile notes, project context, rules, style guides, or domain references.
- Users can upload text-based files: `.txt`, `.md`, `.markdown`, `.json`, `.csv`, `.yaml`, `.yml`.
- Uploaded files are read in the browser and appended as text context.
- Up to 12k reference characters are injected into each debate, consensus, and judge prompt.
- Session metadata records a reference summary, not the full reference body.

Verification:

```bash
npm run build
```

Result: build passed.

## 2026-05-03 - Live Debate Settings During Follow-Up

Added live debate settings controls while a Debate Club session is active:

- The same rounds, judge, judge selection, role presets, and custom role fields are visible during the follow-up stage.
- Users can apply settings immediately, which updates session metadata and adds a `config` log entry.
- Continuing a debate automatically captures the current settings for that follow-up and logs them before the follow-up question.
- Future turns use the current participant list, judge selection, and role instructions.
- Added styling for live settings and config log entries.

Verification:

```bash
npm run build
```

Result: build passed.
