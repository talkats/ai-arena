import { NextResponse } from 'next/server';
import { ENGINES } from '@/lib/engines';
import { callEngineServer, getConfiguredEngines } from '@/lib/serverEngines';

const DEFAULT_ROUNDS = 3;
const MAX_ROUNDS = 10;

const SOURCE_POLICY = [
  'Source and accuracy rules:',
  '- Perplexity Sonar can return web-grounded citations when configured with PERPLEXITY_API_KEY.',
  '- Do not invent citations, URLs, papers, dates, prices, or current events.',
  '- If you rely on known sources, list them under "Sources / verification targets".',
  '- If the answer depends on current information you cannot verify live, say exactly what should be checked online.',
].join('\n');

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isAuthorized(request) {
  const token = process.env.ARENA_AGENT_TOKEN;
  if (!token) return true;

  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${token}`;
}

function clampRounds(value) {
  const parsed = Number(value) || DEFAULT_ROUNDS;
  return Math.min(Math.max(parsed, 1), MAX_ROUNDS);
}

function makeEntry(type, title, text, extra = {}) {
  return {
    type,
    title,
    text,
    time: new Date().toISOString(),
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

function buildDebatePrompt(question, round, maxRounds, discussionLog, engineName) {
  const prior = discussionLog.length
    ? discussionLog.map((entry) => `${entry.engineName || entry.title}:\n${entry.text}`).join('\n\n---\n\n')
    : 'No one has spoken yet.';

  return [
    'You are a participant in a transparent AI debate club.',
    `User question: "${question}"`,
    `You are ${engineName}. This is debate round ${round} of ${maxRounds}.`,
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

function buildDecisionPrompt(question, discussionLog, judgeName) {
  const transcript = discussionLog
    .map((entry) => `${entry.engineName || entry.title}:\n${entry.text}`)
    .join('\n\n---\n\n');

  const bestSourceOptions = ['synthesis', ...ENGINES.map((engine) => engine.id), 'unresolved'].join(' | ');

  return [
    'You are the moderator of a transparent AI debate club.',
    `User question: "${question}"`,
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
    `  "bestSource": "${bestSourceOptions}",`,
    '  "reason": "short explanation",',
    '  "finalAnswer": "clear final answer for the user, including sources or verification targets when relevant"',
    '}',
    '',
    SOURCE_POLICY,
  ].join('\n');
}

function buildJudgePrompt(question, discussionLog, moderatorDecision) {
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

function selectEngines(configuredEngines, requestedParticipants, requestedJudge) {
  const byId = new Map(configuredEngines.map((engine) => [engine.id, engine]));
  const participantIds = Array.isArray(requestedParticipants)
    ? requestedParticipants.filter((id) => byId.has(id))
    : [];

  let participants = participantIds.length
    ? participantIds.map((id) => byId.get(id))
    : configuredEngines;

  let judge = requestedJudge && byId.has(requestedJudge)
    ? byId.get(requestedJudge)
    : null;

  if (!judge && participants.length >= 3) {
    judge = participants[participants.length - 1];
    participants = participants.slice(0, -1);
  }

  if (judge) {
    participants = participants.filter((engine) => engine.id !== judge.id);
  }

  return { participants, judge };
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return jsonError('Unauthorized agent request.', 401);
  }

  try {
    const body = await request.json();
    const question = String(body.question || '').trim();
    if (!question) return jsonError('Missing required field: question');

    const configuredEngines = getConfiguredEngines();
    const rounds = clampRounds(body.rounds);
    const { participants, judge } = selectEngines(
      configuredEngines,
      body.participants,
      body.judge
    );

    if (participants.length < 2) {
      return jsonError('Debate API requires at least 2 configured participant engines.');
    }

    const log = [
      makeEntry('user', 'User question', question, { engineName: 'User' }),
    ];
    let discussionLog = [];

    for (let round = 1; round <= rounds; round += 1) {
      for (const engine of participants) {
        const result = await callEngineServer(engine.id, [
          {
            role: 'user',
            content: buildDebatePrompt(question, round, rounds, discussionLog, engine.name),
          },
        ]);
        const text = result.text || result.error || 'No response was returned.';
        const entry = makeEntry('debate', `${engine.name} responds`, text, {
          engineId: engine.id,
          engineName: engine.name,
          round,
        });

        discussionLog = [...discussionLog, entry];
        log.push(entry);
      }
    }

    const moderator = participants[0];
    const decisionResult = await callEngineServer(moderator.id, [
      {
        role: 'user',
        content: buildDecisionPrompt(question, discussionLog, judge?.name),
      },
    ]);
    const decisionText = decisionResult.text || decisionResult.error || 'No decision was returned.';
    const parsedDecision = tryParseDecision(decisionText);
    const decisionEntry = makeEntry('decision', 'Consensus check', decisionText, {
      engineId: moderator.id,
      engineName: moderator.name,
    });
    log.push(decisionEntry);

    let finalAnswer = parsedDecision?.finalAnswer || decisionText;
    let decidedBy = moderator.id;
    const needsJudge = Boolean(parsedDecision?.needsJudge || !parsedDecision?.finalAnswer);

    if (needsJudge && judge) {
      const judgeResult = await callEngineServer(judge.id, [
        {
          role: 'user',
          content: buildJudgePrompt(question, discussionLog, decisionText),
        },
      ]);
      finalAnswer = judgeResult.text || judgeResult.error || 'No judge response was returned.';
      decidedBy = judge.id;
      log.push(makeEntry('judge', `${judge.name} judge decision`, finalAnswer, {
        engineId: judge.id,
        engineName: judge.name,
      }));
    }

    return NextResponse.json({
      question,
      rounds,
      participants: participants.map((engine) => engine.id),
      judge: judge?.id || null,
      decidedBy,
      consensus: parsedDecision || null,
      finalAnswer,
      log,
    });
  } catch (err) {
    return jsonError(err.message, 500);
  }
}
