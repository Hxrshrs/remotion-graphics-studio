/**
 * What each model has actually cost, accumulated from the `usage.cost` figure
 * OpenRouter returns on every completion. Google AI Studio models are free, so
 * nothing is recorded for them.
 */

const SPEND_KEY = 'motion-studio.spend.v1';

export type ModelSpend = {
  /** Total USD charged for this model. */
  cost: number;
  /** How many generations that covers. */
  runs: number;
};

export type SpendMap = Record<string, ModelSpend>;

export const loadSpend = (): SpendMap => {
  try {
    const raw = window.localStorage.getItem(SPEND_KEY);
    return raw ? (JSON.parse(raw) as SpendMap) : {};
  } catch {
    return {};
  }
};

export const saveSpend = (spend: SpendMap) => {
  try {
    window.localStorage.setItem(SPEND_KEY, JSON.stringify(spend));
  } catch {
    // Spend tracking is a nicety; never let it break a generation.
  }
};

/**
 * Folds one generation into the map. A run with an unknown cost still counts as
 * a run, so the count never under-reports what was sent.
 */
export const recordSpend = (
  spend: SpendMap,
  model: string,
  cost: number | null | undefined,
): SpendMap => {
  const current = spend[model] ?? {cost: 0, runs: 0};
  return {
    ...spend,
    [model]: {
      cost: current.cost + (typeof cost === 'number' && Number.isFinite(cost) ? cost : 0),
      runs: current.runs + 1,
    },
  };
};

/**
 * Lifetime spend per cut, read back from storage.
 *
 * Kept pure and separate from the read so the parsing is testable: this is
 * user-writable JSON, and a string, a NaN, or a negative reaching the panel
 * renders as "$NaN" or an impossible total rather than failing loudly.
 */
export const parseCutSpend = (raw: string | null): Record<string, number> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0,
      ),
    );
  } catch {
    return {};
  }
};

/** Small amounts need more decimals than a currency formatter gives. */
export const formatUsd = (amount: number) => {
  if (amount <= 0) return '$0';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
};
