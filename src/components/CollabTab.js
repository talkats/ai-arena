'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { ENGINES, callEngine, getEngineModel, getModelLabel } from '@/lib/engines';
import { makeUsageRecord } from '@/lib/costs';
import Rendered from './Rendered';

const DEFAULT_ROUNDS = 3;
const MAX_ROUNDS = 10;

const DEBATE_ROLES = [
  {
    name: 'Research lead',
    instruction: 'Prioritize facts, sources, and what must be verified.',
  },
  {
    name: 'Critical reviewer',
    instruction: 'Challenge weak claims, hidden assumptions, and missing risks.',
  },
  {
    name: 'Synthesizer',
    instruction: 'Combine the strongest points into a practical answer.',
  },
  {
    name: 'Strategy lens',
    instruction: 'Focus on tradeoffs, decisions, and next steps.',
  },
];

function resolveDebateRole(engineId, idx, roleSettings = {}) {
  const fallback = DEBATE_ROLES[idx % DEBATE_ROLES.length];
  const setting = roleSettings[engineId];

  if (!setting) return fallback;
  if (setting.type === 'none') return null;

  if (setting.type === 'custom') {
    return {
      name: setting.customName?.trim() || 'Custom role',
      instruction: setting.customInstruction?.trim()
        || 'Follow the custom role requested by the user and make the contribution distinct.',
    };
  }

  return DEBATE_ROLES.find((role) => role.name === setting.type) || fallback;
}

const SOURCE_POLICY = [
  'Source and accuracy rules:',
  '- The API call may not include live web browsing unless the selected provider/model supports it externally.',
  '- Perplexity Sonar can return web-grounded citations when configured with PERPLEXITY_API_KEY.',
  '- Do not invent citations, URLs, papers, dates, prices, or current events.',
  '- If you rely on known sources, list them under "Sources / verification targets".',
  '- If the answer depends on current information you cannot verify live, say exactly what should be checked online.',
].join('\n');

function formatLogEntry(entry) {
  const meta = [
    `type=${entry.type}`,
    entry.engineName ? `engine=${entry.engineName}` : null,
    entry.round ? `round=${entry.round}` : null,
  ].filter(Boolean).join(' | ');

  return [
    `[${entry.time}] ${meta}`,
    entry.title,
    '',
    entry.text,
    '',
    '---',
    '',
  ].join('\n');
}

function makeEntry(type, title, text, extra = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    title,
    text,
    time: new Date().toLocaleTimeString(),
    ...extra,
  };
}

function tryParseDecision(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildReferenceSection(referenceContext) {
  const trimmed = referenceContext?.trim();
  if (!trimmed) return '';

  return [
    'Shared user references / skills:',
    'These notes were provided by the user for this debate. Use them as context, but do not treat them as automatically true if they conflict with evidence.',
    '---',
    trimmed.slice(0, 12000),
    '---',
  ].join('\n');
}

function buildDebatePrompt(question, round, discussionLog, engineName, role, referenceContext) {
  const prior = discussionLog.length
    ? discussionLog.map((entry) => `${entry.engineName || entry.title}:\n${entry.text}`).join('\n\n---\n\n')
    : 'No one has spoken yet.';

  return [
    'You are a participant in a transparent AI debate club.',
    `User question: "${question}"`,
    `You are ${engineName}. This is debate round ${round} of ${MAX_ROUNDS}.`,
    role ? `Your debate role: ${role.name}. ${role.instruction}` : 'You do not have a special debate role. Answer as a general participant.',
    '',
    buildReferenceSection(referenceContext),
    '',
    'Discussion log so far:',
    '---',
    prior,
    '---',
    '',
    'Your job:',
    '- Give your best answer or improvement.',
    '- Address mistakes or weak assumptions from earlier speakers.',
    '- Explicitly say where you agree and where you disagree.',
    '- If a blended answer is better than any single answer, build that blended answer.',
    '- Stay concise and useful.',
    '',
    SOURCE_POLICY,
  ].join('\n');
}

function buildDecisionPrompt(question, discussionLog, judgeName, referenceContext) {
  const transcript = discussionLog
    .map((entry) => `${entry.engineName || entry.title}:\n${entry.text}`)
    .join('\n\n---\n\n');

  return [
    'You are the moderator of a transparent AI debate club.',
    `User question: "${question}"`,
    '',
    buildReferenceSection(referenceContext),
    '',
    'Full debate transcript:',
    '---',
    transcript,
    '---',
    '',
    'Decide whether the debating models reached a good shared final answer.',
    'The final answer can be a synthesis made from multiple models; it does not have to choose one winner.',
    judgeName
      ? `If the transcript is still conflicted or unreliable, set needsJudge to true so the non-participating judge (${judgeName}) can decide.`
      : 'No outside judge is available, so only set needsJudge to true if the result is genuinely unresolved.',
    '',
    'Return ONLY valid JSON in this shape:',
    '{',
    '  "consensusReached": true,',
    '  "needsJudge": false,',
    '  "bestSource": "synthesis | claude | gemini | chatgpt | unresolved",',
    '  "reason": "short explanation",',
    '  "finalAnswer": "clear final answer for the user, including sources or verification targets when relevant"',
    '}',
    '',
    SOURCE_POLICY,
  ].join('\n');
}

function buildJudgePrompt(question, discussionLog, moderatorDecision, referenceContext) {
  const transcript = discussionLog
    .map((entry) => `${entry.engineName || entry.title}:\n${entry.text}`)
    .join('\n\n---\n\n');

  return [
    'You are an independent judge. You did not participate in the debate.',
    `User question: "${question}"`,
    '',
    'Moderator could not establish a reliable consensus:',
    moderatorDecision || 'No structured moderator decision was available.',
    '',
    buildReferenceSection(referenceContext),
    '',
    'Full debate transcript:',
    '---',
    transcript,
    '---',
    '',
    'Choose the strongest final answer. You may combine multiple answers if the best answer is a synthesis.',
    'Be transparent about why you chose it, but answer the user directly.',
    '',
    SOURCE_POLICY,
  ].join('\n');
}

function buildFollowUpQuestion(originalQuestion, followUp) {
  return [
    `Original debate question: "${originalQuestion}"`,
    `User follow-up question: "${followUp}"`,
    '',
    'Continue the same debate. Do not restart from scratch.',
    'Use the previous discussion as context, answer the follow-up directly,',
    'and revise the final recommendation if the follow-up changes it.',
  ].join('\n');
}

function getEngineName(engineId) {
  return ENGINES.find((engine) => engine.id === engineId)?.name || engineId;
}

export default function CollabTab({
  apiKeys,
  availableKeys,
  modelSettings,
  onSaveSession,
  onTrackUsage,
}) {
  const [input, setInput] = useState('');
  const [rounds, setRounds] = useState(DEFAULT_ROUNDS);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [useJudge, setUseJudge] = useState(true);
  const [selectedJudgeId, setSelectedJudgeId] = useState('');
  const [judgePreferenceTouched, setJudgePreferenceTouched] = useState(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);
  const [roleSettings, setRoleSettings] = useState({});
  const [referenceContext, setReferenceContext] = useState('');
  const [referenceFiles, setReferenceFiles] = useState([]);
  const scrollRef = useRef(null);
  const abortRef = useRef(false);
  const savedSessionRef = useRef(null);

  const activeEngines = useMemo(() => ENGINES.filter((e) => !!availableKeys[e.id]), [availableKeys]);
  const judgeEngine = useMemo(() => (
    useJudge ? activeEngines.find((engine) => engine.id === selectedJudgeId) || null : null
  ), [activeEngines, selectedJudgeId, useJudge]);
  const debateEngines = useMemo(() => (
    activeEngines.filter((engine) => (
      selectedParticipantIds.includes(engine.id)
      && (!judgeEngine || engine.id !== judgeEngine.id)
    ))
  ), [activeEngines, judgeEngine, selectedParticipantIds]);
  const roleByEngine = useMemo(() => (
    Object.fromEntries(
      debateEngines.map((engine, idx) => [engine.id, resolveDebateRole(engine.id, idx, roleSettings)])
    )
  ), [debateEngines, roleSettings]);

  useEffect(() => {
    const activeIds = activeEngines.map((engine) => engine.id);

    setSelectedParticipantIds((prev) => {
      const existing = prev.filter((id) => activeIds.includes(id));
      const missing = activeIds.filter((id) => !existing.includes(id));
      return [...existing, ...missing];
    });

    if (activeEngines.length < 3) {
      setUseJudge(false);
    }

    if (activeEngines.length >= 3 && !selectedJudgeId) {
      setSelectedJudgeId(activeEngines[activeEngines.length - 1].id);
    }

    if (activeEngines.length >= 3 && !judgePreferenceTouched && !session) {
      setUseJudge(true);
    }

    if (selectedJudgeId && !activeEngines.some((engine) => engine.id === selectedJudgeId)) {
      setSelectedJudgeId(activeEngines[activeEngines.length - 1]?.id || '');
    }
  }, [activeEngines, judgePreferenceTouched, selectedJudgeId, session]);

  const updateRoleSetting = (engineId, patch) => {
    setRoleSettings((prev) => ({
      ...prev,
      [engineId]: {
        ...(prev[engineId] || {}),
        ...patch,
      },
    }));
  };

  const toggleParticipant = (engineId) => {
    setSelectedParticipantIds((prev) => (
      prev.includes(engineId)
        ? prev.filter((id) => id !== engineId)
        : [...prev, engineId]
    ));
  };

  const handleReferenceFiles = async (files) => {
    const textFiles = Array.from(files || []);
    if (!textFiles.length) return;

    const loaded = await Promise.all(textFiles.map(async (file) => {
      const text = await file.text();
      return {
        name: file.name,
        size: file.size,
        text: text.slice(0, 24000),
      };
    }));

    setReferenceFiles((prev) => [...prev, ...loaded.map(({ name, size }) => ({ name, size }))]);
    setReferenceContext((prev) => [
      prev,
      ...loaded.map((file) => [
        `### Uploaded reference: ${file.name}`,
        file.text,
      ].join('\n')),
    ].filter(Boolean).join('\n\n'));
  };

  const getCurrentDebateSettings = () => ({
    participants: debateEngines.map((engine) => engine.id),
    judgeId: judgeEngine?.id || null,
    roles: Object.fromEntries(
      debateEngines.map((engine) => [engine.id, roleByEngine[engine.id]?.name])
    ),
    referenceSummary: referenceContext.trim()
      ? `${referenceContext.trim().length} reference characters loaded`
      : null,
  });

  const describeCurrentDebateSettings = () => {
    const settings = getCurrentDebateSettings();
    const participantLine = settings.participants
      .map((id) => `${getEngineName(id)} (${settings.roles[id] || 'No specific role'})`)
      .join(', ');

    return [
      `Rounds for next run: ${Math.min(Number(rounds) || 1, MAX_ROUNDS)}`,
      `Participants: ${participantLine || 'None'}`,
      `Judge: ${settings.judgeId ? getEngineName(settings.judgeId) : 'None'}`,
      `References: ${settings.referenceSummary || 'None'}`,
    ].join('\n');
  };

  const applyLiveSettings = () => {
    if (!session) return;

    const settings = getCurrentDebateSettings();
    const entry = makeEntry(
      'config',
      'Debate settings updated',
      describeCurrentDebateSettings(),
      { engineName: 'System' }
    );

    updateSession({
      ...settings,
      log: [...session.log, entry],
    });
  };

  const renderDebateSettings = ({ live = false } = {}) => (
    <div className={`debate-settings ${live ? 'debate-settings-live' : ''}`}>
      <div className="debate-settings-head">
        <div>
          <strong>{live ? 'Current debate settings' : 'Debate settings'}</strong>
          <span>{live ? 'Changes affect the next follow-up round.' : 'Configure the room before sending.'}</span>
        </div>
        {live && (
          <button
            className="ctrl-btn"
            onClick={applyLiveSettings}
            disabled={loading || session?.status === 'running' || debateEngines.length < 2}
          >
            Apply Settings
          </button>
        )}
      </div>
      <div className="debate-setup">
        <div className="iter-control">
          <label>Rounds:</label>
          <input
            type="range"
            min={1}
            max={MAX_ROUNDS}
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
          />
          <span className="iter-num">{rounds}</span>
        </div>
        <div className="judge-controls">
          <label className="judge-toggle">
            <input
              type="checkbox"
              checked={useJudge}
              disabled={activeEngines.length < 3}
              onChange={(e) => {
                setJudgePreferenceTouched(true);
                setUseJudge(e.target.checked);
              }}
            />
            Use judge
          </label>
          {useJudge && activeEngines.length >= 3 && (
            <select
              className="judge-select"
              value={selectedJudgeId}
              onChange={(e) => setSelectedJudgeId(e.target.value)}
            >
              {activeEngines.map((engine) => (
                <option key={engine.id} value={engine.id}>{engine.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="judge-note">
        {judgeEngine
          ? `${judgeEngine.name} is reserved as the non-participating judge.`
          : 'Any 2 connected models can debate. Add 3+ only if you want an outside judge.'}
      </div>

      {activeEngines.length > 0 && (
        <div className="participant-picker">
          <div className="settings-subhead">
            <strong>Participants</strong>
            <span>Select which connected engines join the debate.</span>
          </div>
          <div className="participant-grid">
            {activeEngines.map((engine) => {
              const isJudge = judgeEngine?.id === engine.id;
              const checked = selectedParticipantIds.includes(engine.id) && !isJudge;

              return (
                <label
                  key={engine.id}
                  className={`participant-chip ${checked ? 'active' : ''} ${isJudge ? 'muted' : ''}`}
                  style={{ '--eng-color': engine.color }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isJudge}
                    onChange={() => toggleParticipant(engine.id)}
                  />
                  <span>{engine.icon}</span>
                  {engine.name}
                  {isJudge && <small>Judge</small>}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {debateEngines.length > 0 && (
        <div className="role-grid">
          {debateEngines.map((engine) => {
            const setting = roleSettings[engine.id] || {};
            const selectedRole = setting.type || roleByEngine[engine.id]?.name || DEBATE_ROLES[0].name;
            const isCustom = selectedRole === 'custom';
            const hasNoRole = selectedRole === 'none';

            return (
              <div key={engine.id} className="role-card" style={{ '--eng-color': engine.color }}>
                <div className="role-card-head">
                  <span>{engine.icon}</span>
                  <strong>{engine.name}</strong>
                </div>
                <label>Debate role</label>
                <select
                  className="role-select"
                  value={selectedRole}
                  onChange={(e) => updateRoleSetting(engine.id, { type: e.target.value })}
                >
                  <option value="none">No specific role</option>
                  {DEBATE_ROLES.map((role) => (
                    <option key={role.name} value={role.name}>{role.name}</option>
                  ))}
                  <option value="custom">Custom role</option>
                </select>
                {isCustom ? (
                  <>
                    <input
                      className="role-custom-input"
                      value={setting.customName || ''}
                      onChange={(e) => updateRoleSetting(engine.id, { customName: e.target.value })}
                      placeholder="Role name..."
                    />
                    <textarea
                      className="role-custom-textarea"
                      value={setting.customInstruction || ''}
                      onChange={(e) => updateRoleSetting(engine.id, { customInstruction: e.target.value })}
                      placeholder="What should this engine focus on?"
                      rows={3}
                    />
                  </>
                ) : hasNoRole ? (
                  <small>This model joins as a general participant without a predefined angle.</small>
                ) : (
                  <small>{roleByEngine[engine.id]?.instruction}</small>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="reference-panel">
        <div className="settings-subhead">
          <strong>Shared references / skills</strong>
          <span>Optional context for the debating models.</span>
        </div>
        <textarea
          className="reference-textarea"
          value={referenceContext}
          onChange={(e) => setReferenceContext(e.target.value)}
          placeholder="Paste user profile notes, project rules, domain references, style guides, constraints, or skills for this debate..."
          rows={4}
        />
        <div className="reference-actions">
          <label className="file-upload-btn">
            Upload text files
            <input
              type="file"
              multiple
              accept=".txt,.md,.markdown,.json,.csv,.yaml,.yml"
              onChange={(e) => handleReferenceFiles(e.target.files)}
            />
          </label>
          {referenceContext.trim() && (
            <button
              className="ctrl-btn"
              type="button"
              onClick={() => {
                setReferenceContext('');
                setReferenceFiles([]);
              }}
            >
              Clear References
            </button>
          )}
          <span className="reference-note">
            {referenceFiles.length
              ? `${referenceFiles.length} file(s) loaded. Up to 12k chars are sent per model call.`
              : 'Text stays local in this browser until sent to selected providers.'}
          </span>
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [session, loading, currentSpeaker]);

  useEffect(() => {
    if (!session?.finalAnswer || savedSessionRef.current === session.question) return;

    savedSessionRef.current = session.question;
    onSaveSession?.({
      type: 'debate',
      question: session.question,
      models: session.participants.map((id) => ENGINES.find((engine) => engine.id === id)?.name || id),
      judge: session.judgeId ? ENGINES.find((engine) => engine.id === session.judgeId)?.name : null,
      roles: session.roles,
      referenceSummary: session.referenceSummary,
      log: session.log,
      finalAnswer: session.finalAnswer,
    });
  }, [session, onSaveSession]);

  const appendEntry = (entry) => {
    setSession((prev) => {
      if (!prev) return prev;
      const nextLog = [...prev.log, entry];
      return { ...prev, log: nextLog };
    });
  };

  const updateSession = (patch) => {
    setSession((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const runDebateTurns = async ({
    question,
    discussionLog,
    selectedRounds,
    roundOffset = 0,
    phasePrefix = 'round',
  }) => {
    let nextDiscussionLog = [...discussionLog];

    for (let round = 1; round <= selectedRounds && !abortRef.current; round += 1) {
      updateSession({ currentRound: roundOffset + round, status: 'running' });

      for (const engine of debateEngines) {
        if (abortRef.current) break;

        setCurrentSpeaker(engine.name);
        setLoading(true);

        const prompt = buildDebatePrompt(
          question,
          roundOffset + round,
          nextDiscussionLog,
          engine.name,
          roleByEngine[engine.id],
          referenceContext
        );
        const messages = [{ role: 'user', content: prompt }];
        const modelId = getEngineModel(engine.id, modelSettings);
        const result = await callEngine(engine.id, apiKeys[engine.id], messages, undefined, modelId);
        const text = result.text || result.error || 'No response was returned.';
        onTrackUsage?.(makeUsageRecord({
          engine,
          modelId,
          modelName: getModelLabel(engine.id, modelId),
          mode: 'debate',
          phase: `${phasePrefix} ${roundOffset + round}`,
          messages,
          outputText: text,
        }));
        const entry = makeEntry('debate', `${engine.name} responds`, text, {
          engineId: engine.id,
          engineName: engine.name,
          roleName: roleByEngine[engine.id]?.name,
          round: roundOffset + round,
          color: engine.color,
        });

        nextDiscussionLog = [...nextDiscussionLog, entry];
        appendEntry(entry);
        setLoading(false);
      }
    }

    return nextDiscussionLog;
  };

  const startDebate = async () => {
    if (!input.trim() || debateEngines.length < 2) return;

    const question = input.trim();
    const selectedRounds = Math.min(Number(rounds) || 1, MAX_ROUNDS);
    const openingEntry = makeEntry(
      'user',
      'User question',
      question,
      { engineName: 'User' }
    );

    abortRef.current = false;
    setInput('');
    savedSessionRef.current = null;
    const settings = getCurrentDebateSettings();
    setSession({
      question,
      status: 'running',
      currentRound: 1,
      maxRounds: selectedRounds,
      ...settings,
      log: [openingEntry],
      decision: null,
      finalAnswer: null,
    });

    const discussionLog = await runDebateTurns({
      question,
      discussionLog: [],
      selectedRounds,
    });

    if (!abortRef.current) {
      await settleDebate(question, discussionLog);
    }

    setCurrentSpeaker('');
    setLoading(false);
  };

  const continueDebate = async () => {
    if (!session || !followUp.trim() || debateEngines.length < 2) return;

    const followUpText = followUp.trim();
    const selectedRounds = Math.min(Number(rounds) || 1, MAX_ROUNDS);
    const previousDebate = session.log.filter((entry) => ['debate', 'decision', 'judge'].includes(entry.type));
    const question = buildFollowUpQuestion(session.question, followUpText);
    const followUpEntry = makeEntry('user', 'Follow-up question', followUpText, { engineName: 'User' });
    const settings = getCurrentDebateSettings();
    const configEntry = makeEntry(
      'config',
      'Debate settings for follow-up',
      describeCurrentDebateSettings(),
      { engineName: 'System' }
    );

    abortRef.current = false;
    setFollowUp('');
    savedSessionRef.current = null;
    updateSession({
      status: 'running',
      finalAnswer: null,
      decision: null,
      ...settings,
      maxRounds: (session.maxRounds || 0) + selectedRounds,
      log: [...session.log, configEntry, followUpEntry],
    });

    const discussionLog = await runDebateTurns({
      question,
      discussionLog: previousDebate,
      selectedRounds,
      roundOffset: session.currentRound || session.maxRounds || 0,
      phasePrefix: 'follow-up round',
    });

    if (!abortRef.current) {
      await settleDebate(question, discussionLog);
    }

    setCurrentSpeaker('');
    setLoading(false);
  };

  const settleDebate = async (question, discussionLog) => {
    const moderator = debateEngines[0];
    if (!moderator) return;

    setCurrentSpeaker(`${moderator.name} moderator`);
    setLoading(true);

    const decisionMessages = [
      { role: 'user', content: buildDecisionPrompt(question, discussionLog, judgeEngine?.name, referenceContext) },
    ];
    const moderatorModelId = getEngineModel(moderator.id, modelSettings);
    const decisionResult = await callEngine(
      moderator.id,
      apiKeys[moderator.id],
      decisionMessages,
      undefined,
      moderatorModelId
    );
    const decisionText = decisionResult.text || decisionResult.error || 'No decision was returned.';
    onTrackUsage?.(makeUsageRecord({
      engine: moderator,
      modelId: moderatorModelId,
      modelName: getModelLabel(moderator.id, moderatorModelId),
      mode: 'debate',
      phase: 'consensus check',
      messages: decisionMessages,
      outputText: decisionText,
    }));
    const parsedDecision = tryParseDecision(decisionText);
    const decisionEntry = makeEntry('decision', 'Consensus check', decisionText, {
      engineId: moderator.id,
      engineName: moderator.name,
      color: moderator.color,
    });

    appendEntry(decisionEntry);
    updateSession({ decision: parsedDecision || { raw: decisionText } });

    const needsJudge = Boolean(parsedDecision?.needsJudge || !parsedDecision?.finalAnswer);

    if (needsJudge && judgeEngine) {
      setCurrentSpeaker(`${judgeEngine.name} judge`);
      const judgeMessages = [
        { role: 'user', content: buildJudgePrompt(question, discussionLog, decisionText, referenceContext) },
      ];
      const judgeModelId = getEngineModel(judgeEngine.id, modelSettings);
      const judgeResult = await callEngine(
        judgeEngine.id,
        apiKeys[judgeEngine.id],
        judgeMessages,
        undefined,
        judgeModelId
      );
      const judgeText = judgeResult.text || judgeResult.error || 'No judge response was returned.';
      onTrackUsage?.(makeUsageRecord({
        engine: judgeEngine,
        modelId: judgeModelId,
        modelName: getModelLabel(judgeEngine.id, judgeModelId),
        mode: 'debate',
        phase: 'judge',
        messages: judgeMessages,
        outputText: judgeText,
      }));
      const judgeEntry = makeEntry('judge', `${judgeEngine.name} judge decision`, judgeText, {
        engineId: judgeEngine.id,
        engineName: judgeEngine.name,
        color: judgeEngine.color,
      });

      appendEntry(judgeEntry);
      updateSession({
        finalAnswer: judgeText,
        status: 'done',
      });
    } else {
      updateSession({
        finalAnswer: parsedDecision?.finalAnswer || decisionText,
        status: 'done',
      });
    }

    setLoading(false);
  };

  const stopAndSummarize = async () => {
    if (!session || session.status !== 'running') return;
    abortRef.current = true;
    const debateOnly = session.log.filter((entry) => entry.type === 'debate');
    await settleDebate(session.question, debateOnly);
  };

  const reset = () => {
    abortRef.current = true;
    setSession(null);
    setLoading(false);
    setCurrentSpeaker('');
  };

  const exportLog = () => {
    if (!session) return;

    const body = [
      `AI Arena Debate Club Log`,
      `Question: ${session.question}`,
      `Participants: ${session.participants.map((id) => ENGINES.find((e) => e.id === id)?.name).join(', ')}`,
      `Judge: ${session.judgeId ? ENGINES.find((e) => e.id === session.judgeId)?.name : 'None'}`,
      '',
      ...session.log.map(formatLogEntry),
    ].join('\n');

    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-arena-debate-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="tab-content">
      <div className="messages-area" ref={scrollRef}>
        {!session && (
          <div className="empty-state">
            <div className="empty-icon">DB</div>
            <h3>Debate Club</h3>
            <p>
              Ask a question and connected models will debate transparently for up to
              ten rounds. If they cannot settle on a strong answer, a reserved judge
              model decides or creates a synthesis.
            </p>
          </div>
        )}

        {session && (
          <div className="debate-shell">
            <div className="debate-meta">
              <span>Participants: {session.participants.map((id) => ENGINES.find((e) => e.id === id)?.name).join(', ')}</span>
              <span>Judge: {session.judgeId ? ENGINES.find((e) => e.id === session.judgeId)?.name : 'not available'}</span>
              <span>Rounds: {session.maxRounds}</span>
              {session.referenceSummary && <span>References: {session.referenceSummary}</span>}
            </div>
            <div className="debate-meta role-meta">
              {session.participants.map((id) => (
                <span key={id}>
                  {ENGINES.find((e) => e.id === id)?.name}: {session.roles?.[id] || 'No specific role'}
                </span>
              ))}
            </div>

            <div className="debate-log">
              {session.log.map((entry) => {
                const className = [
                  'debate-entry',
                  `debate-entry-${entry.type}`,
                ].join(' ');

                return (
                  <div key={entry.id} className={className} style={{ '--eng-color': entry.color }}>
                    <div className="debate-entry-head">
                      <span>{entry.roleName ? `${entry.title} - ${entry.roleName}` : entry.title}</span>
                      <span>{entry.round ? `Round ${entry.round}` : entry.time}</span>
                    </div>
                    <Rendered text={entry.text} />
                  </div>
                );
              })}

              {loading && (
                <div className="debate-entry debate-entry-loading">
                  <div className="debate-entry-head">
                    <span>{currentSpeaker || 'Working'}</span>
                    <span>live</span>
                  </div>
                  <div className="loading-dots"><span /><span /><span /></div>
                </div>
              )}
            </div>

            {session.finalAnswer && (
              <div className="summary-bubble debate-final">
                <span className="bubble-label">Final answer</span>
                <Rendered text={session.finalAnswer} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="input-area">
        {!session ? (
          <>
            {renderDebateSettings()}
            <div className="source-note">
              Models are asked for sources and verification targets. Live web browsing is not
              available through these plain API calls unless you add a search/browsing provider.
            </div>
            <div className="input-row">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the debate club a question..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    startDebate();
                  }
                }}
                rows={2}
              />
              <button
                className="send-btn collab-send"
                onClick={startDebate}
                disabled={!input.trim() || debateEngines.length < 2}
              >
                Start Debate
              </button>
            </div>
            {debateEngines.length < 2 && (
              <p className="debate-warning">
                Debate requires at least 2 connected participant models. Other API keys can stay empty.
              </p>
            )}
          </>
        ) : (
          <div className="debate-follow-up">
            {renderDebateSettings({ live: true })}
            <div className="session-controls">
              {session.status === 'running' && (
                <button className="ctrl-btn" onClick={stopAndSummarize} disabled={loading}>
                  Decide Now
                </button>
              )}
              <button className="ctrl-btn" onClick={exportLog}>
                Export Log
              </button>
              <button className="ctrl-btn" onClick={reset}>
                New Debate
              </button>
              {session.status === 'running' && (
                <span className="iter-indicator">
                  Round {session.currentRound} / {session.maxRounds}
                  {currentSpeaker ? ` - ${currentSpeaker}` : ''}
                </span>
              )}
              {session.status === 'done' && (
                <span className="iter-indicator">Debate complete - ask a follow-up below</span>
              )}
            </div>
            <div className="input-row follow-up-input-row">
              <textarea
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Ask a follow-up and continue this debate..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    continueDebate();
                  }
                }}
                rows={2}
              />
              <button
                className="send-btn collab-send"
                onClick={continueDebate}
                disabled={!followUp.trim() || loading || debateEngines.length < 2}
              >
                Continue Debate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
