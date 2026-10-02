import { formatINR } from './money.js';

export type SplitMethod = 'EQUAL' | 'CUSTOM' | 'PERCENTAGE' | 'SHARES' | 'EXACT';
/** value: paise (CUSTOM/EXACT), basis points (PERCENTAGE: 5000 = 50%), share count (SHARES) */
export interface SplitInput { userId: number; value?: number }
export interface Allocation { userId: number; sharePaise: number }

export class SplitError extends Error {}

/** Distribute `total` proportionally to integer weights using largest remainder; deterministic (ties -> lower userId). */
function distribute(total: number, entries: { userId: number; weight: number }[]): Allocation[] {
  const sumW = entries.reduce((a, e) => a + e.weight, 0);
  if (sumW <= 0) throw new SplitError('Split weights must be positive');
  const base = entries.map((e) => {
    const exact = (total * e.weight) / sumW;
    const floor = Math.floor(exact);
    return { userId: e.userId, floor, rem: exact - floor };
  });
  let left = total - base.reduce((a, b) => a + b.floor, 0);
  const order = [...base].sort((a, b) => b.rem - a.rem || a.userId - b.userId);
  for (const o of order) {
    if (left <= 0) break;
    o.floor += 1;
    left -= 1;
  }
  return base.map((b) => ({ userId: b.userId, sharePaise: b.floor }));
}

/**
 * Compute exact allocations that always sum to totalPaise.
 * Throws SplitError for invalid input; never silently produces an unbalanced split.
 */
export function computeSplit(totalPaise: number, method: SplitMethod, inputs: SplitInput[]): Allocation[] {
  if (!Number.isInteger(totalPaise) || totalPaise <= 0) throw new SplitError('Amount must be a positive integer number of paise');
  if (inputs.length === 0) throw new SplitError('At least one participant is required');
  const ids = inputs.map((i) => i.userId);
  if (new Set(ids).size !== ids.length) throw new SplitError('Duplicate participants in split');
  const need = (i: SplitInput) => {
    if (i.value === undefined || !Number.isInteger(i.value) || i.value < 0) throw new SplitError('Split values must be non-negative integers');
    return i.value;
  };
  switch (method) {
    case 'EQUAL':
      return distribute(totalPaise, inputs.map((i) => ({ userId: i.userId, weight: 1 })));
    case 'SHARES': {
      const w = inputs.map((i) => ({ userId: i.userId, weight: need(i) }));
      if (w.some((x) => x.weight < 1)) throw new SplitError('Each participant needs at least 1 share');
      return distribute(totalPaise, w);
    }
    case 'PERCENTAGE': {
      const bp = inputs.map(need);
      if (bp.reduce((a, b) => a + b, 0) !== 10000) throw new SplitError('Percentages must total exactly 100%');
      return distribute(totalPaise, inputs.map((i) => ({ userId: i.userId, weight: i.value! })));
    }
    case 'CUSTOM':
    case 'EXACT': {
      const vals = inputs.map(need);
      const sum = vals.reduce((a, b) => a + b, 0);
      if (sum !== totalPaise) throw new SplitError(`Split amounts add up to ${formatINR(sum)} but the expense is ${formatINR(totalPaise)} (difference ${formatINR(Math.abs(totalPaise - sum))})`);
      return inputs.map((i) => ({ userId: i.userId, sharePaise: i.value! }));
    }
    default:
      throw new SplitError('Unknown split method');
  }
}
