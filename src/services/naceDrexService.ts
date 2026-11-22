/**
 * Nace Drex decisions — POST https://console.nace.ai/v1/systemone
 *
 * Server-side only. NACE_API_KEY spends account credit and the Drex API sends
 * no CORS headers, so this module belongs in a backend or a Node script
 * (scripts/nace-drex-smoke.ts), never inside the browser bundle.
 *
 * Drex reads one case state plus typed questions (noul = yes/no, choice = one
 * of several labels, score = ordered rubric) and returns a calibrated
 * probability for every option. `leadingOption`/`routeOnProbability` turn those
 * probabilities into an action or a route to a human.
 */

export const NACE_DREX_MODEL = 'drex-latest';

const NACE_SYSTEMONE_URL = 'https://console.nace.ai/v1/systemone';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;

export type DrexState =
  | string
  | number
  | boolean
  | null
  | DrexState[]
  | { [key: string]: DrexState };

export type NoulCriteria = { true?: string; false?: string };

export interface NoulQuestion {
  type: 'noul';
  instructions?: string;
  criteria?: NoulCriteria;
}

export interface ChoiceQuestion<L extends string = string> {
  type: 'choice';
  instructions?: string;
  criteria: Record<L, string>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions?: string;
  criteria: string[];
}

export type DrexQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type DrexQuestions = Record<string, DrexQuestion>;

export interface NoulAnswer {
  type: 'noul';
  /** Probability of "yes", from 0 to 1. */
  noul: number;
  confidence?: number;
}

export interface ChoiceAnswer<L extends string = string> {
  type: 'choice';
  choice: L;
  confidence: number;
  probabilities: Record<L, number>;
}

export interface ScoreAnswer {
  type: 'score';
  /** Expected score; it can fall between two levels. */
  score: number;
  confidence: number;
  legend: string[];
  probabilities: Record<string, number>;
}

export type DrexAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type DrexAnswerFor<Q extends DrexQuestion> = Q extends { type: 'noul' }
  ? NoulAnswer
  : Q extends ChoiceQuestion<infer L>
    ? ChoiceAnswer<L & string>
    : Q extends ScoreQuestion
      ? ScoreAnswer
      : never;

export interface DrexUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface DecideParams<Q extends DrexQuestions> {
  /** The case the questions are about: customer, balance, history, text... */
  state: DrexState;
  questions: Q;
  /** Defaults to NACE_DREX_MODEL ("drex-latest"). */
  model?: string;
  timeoutMs?: number;
}

export interface DrexDecision<Q extends DrexQuestions> {
  /** The model version that answered. */
  model: string;
  answers: { [K in keyof Q]: DrexAnswerFor<Q[K]> };
  usage?: DrexUsage;
  evaluationTimeMs?: number;
  requestId?: string;
}

export interface DrexOption {
  option: string;
  probability: number;
}

export interface DrexRoute extends DrexOption {
  /** True when the leading option clears the threshold and can be acted on. */
  confident: boolean;
}

export interface NaceDrexErrorOptions {
  status?: number;
  code?: string;
  retryAfterMs?: number;
}

export class NaceDrexError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly retryAfterMs?: number;

  constructor(message: string, options: NaceDrexErrorOptions = {}) {
    super(message);
    this.name = 'NaceDrexError';
    this.status = options.status;
    this.code = options.code;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** Typed question builders, mirroring the Drex wire shape. */
export const noul = (
  instructions?: string,
  criteria?: NoulCriteria
): NoulQuestion => ({ type: 'noul', instructions, criteria });

export const choice = <L extends string>(
  instructions: string,
  criteria: Record<L, string>
): ChoiceQuestion<L> => ({ type: 'choice', instructions, criteria });

export const score = (instructions: string, criteria: string[]): ScoreQuestion => ({
  type: 'score',
  instructions,
  criteria,
});

/** Reads NACE_API_KEY without touching a browser global that does not exist. */
export function readNaceApiKey(): string | null {
  const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  const value = env?.NACE_API_KEY?.trim();
  return value ? value : null;
}

export function isNaceConfigured(): boolean {
  return readNaceApiKey() !== null;
}

interface SystemOneResponseBody {
  model?: string;
  answers?: Record<string, DrexAnswer>;
  usage?: DrexUsage;
  evaluation_time_ms?: number;
  request_id?: string;
  error?: { message?: string; code?: string };
}

/** Asks Drex the typed questions about one case state. */
export async function decideWithDrex<Q extends DrexQuestions>(
  params: DecideParams<Q>
): Promise<DrexDecision<Q>> {
  const apiKey = readNaceApiKey();
  if (!apiKey) {
    throw new NaceDrexError(
      'NACE_API_KEY is not set. Export it in the environment that runs this code, then retry.',
      { code: 'missing_api_key' }
    );
  }

  const model = params.model ?? NACE_DREX_MODEL;
  let response: Response;
  try {
    response = await fetch(NACE_SYSTEMONE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, state: params.state, questions: params.questions }),
      signal: AbortSignal.timeout(params.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new NaceDrexError(
      `Drex request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { code: 'network_error' }
    );
  }

  const body = (await response.json().catch(() => null)) as SystemOneResponseBody | null;

  if (!response.ok) {
    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    throw new NaceDrexError(
      body?.error?.message ?? `Drex answered HTTP ${response.status}.`,
      {
        status: response.status,
        code: body?.error?.code,
        retryAfterMs: Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds * 1000
          : undefined,
      }
    );
  }

  if (!body || typeof body.answers !== 'object' || body.answers === null) {
    throw new NaceDrexError('Drex returned a response without answers.', {
      status: response.status,
      code: 'malformed_response',
    });
  }

  return {
    model: body.model ?? model,
    answers: body.answers as DrexDecision<Q>['answers'],
    usage: body.usage,
    evaluationTimeMs: body.evaluation_time_ms,
    requestId: body.request_id,
  };
}

/** The option Drex put the most probability on, or null when it sent none. */
export function leadingOption(answer: DrexAnswer): DrexOption | null {
  if (answer.type === 'noul') {
    return answer.noul >= 0.5
      ? { option: 'yes', probability: answer.noul }
      : { option: 'no', probability: 1 - answer.noul };
  }

  let bestKey: string | null = null;
  let bestProbability = -Infinity;
  for (const [key, probability] of Object.entries(answer.probabilities ?? {})) {
    if (probability > bestProbability) {
      bestKey = key;
      bestProbability = probability;
    }
  }
  if (bestKey === null) return null;

  if (answer.type === 'score') {
    const label = answer.legend?.[Number(bestKey)];
    return { option: label ?? bestKey, probability: bestProbability };
  }
  return { option: bestKey, probability: bestProbability };
}

/**
 * Routes on the calibrated probability: the winning option is returned either
 * way, and `confident` says whether it clears the threshold, so a caller can
 * act automatically or send the case to a person.
 */
export function routeOnProbability(
  answer: DrexAnswer,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD
): DrexRoute {
  const leading = leadingOption(answer);
  if (!leading) {
    throw new NaceDrexError('Drex returned no probabilities for this answer.', {
      code: 'empty_probabilities',
    });
  }
  return { ...leading, confident: leading.probability >= threshold };
}