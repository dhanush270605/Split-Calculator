import { describe, it, expect } from 'vitest';
import { computeSplit, SplitError } from '../src/engine/split.js';
import { computeLedger, simplifyDebts, LedgerExpense } from '../src/engine/balances.js';
import { rupeesToPaise, formatINR } from '../src/engine/money.js';

const sum = (a: { sharePaise: number }[]) => a.reduce((x, y) => x + y.sharePaise, 0);
const ids = (...n: number[]) => n.map((userId) => ({ userId }));

describe('money', () => {
  it('converts and formats', () => {
    expect(rupeesToPaise('100.50')).toBe(10050);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(formatINR(123456789)).toBe('₹12,34,567.89');
    expect(formatINR(-5050)).toBe('-₹50.50');
    expect(() => rupeesToPaise('abc')).toThrow();
  });
});

describe('split methods', () => {
  it('equal: 300 / 3', () => {
    expect(computeSplit(30000, 'EQUAL', ids(1, 2, 3)).map((a) => a.sharePaise)).toEqual([10000, 10000, 10000]);
  });
  it('equal with remainder never loses a paisa', () => {
    const r = computeSplit(10000, 'EQUAL', ids(1, 2, 3));
    expect(sum(r)).toBe(10000);
    expect(r.map((a) => a.sharePaise).sort()).toEqual([3333, 3333, 3334]);
  });
  it('is deterministic', () => {
    expect(computeSplit(10001, 'EQUAL', ids(5, 2, 9))).toEqual(computeSplit(10001, 'EQUAL', ids(5, 2, 9)));
  });
  it('custom: 100/75/125 = 300', () => {
    const r = computeSplit(30000, 'CUSTOM', [{ userId: 1, value: 10000 }, { userId: 2, value: 7500 }, { userId: 3, value: 12500 }]);
    expect(r.map((a) => a.sharePaise)).toEqual([10000, 7500, 12500]);
  });
  it('custom rejects unbalanced totals', () => {
    expect(() => computeSplit(30000, 'CUSTOM', [{ userId: 1, value: 10000 }, { userId: 2, value: 10000 }])).toThrow(SplitError);
  });
  it('exact rejects mismatch', () => {
    expect(() => computeSplit(100, 'EXACT', [{ userId: 1, value: 99 }])).toThrow(SplitError);
  });
  it('percentage 50/30/20', () => {
    const r = computeSplit(100000, 'PERCENTAGE', [{ userId: 1, value: 5000 }, { userId: 2, value: 3000 }, { userId: 3, value: 2000 }]);
    expect(r.map((a) => a.sharePaise)).toEqual([50000, 30000, 20000]);
  });
  it('percentage must total 100%', () => {
    expect(() => computeSplit(1000, 'PERCENTAGE', [{ userId: 1, value: 5000 }, { userId: 2, value: 4000 }])).toThrow(/100%/);
  });
  it('percentage rounding sums exactly', () => {
    const r = computeSplit(1001, 'PERCENTAGE', [{ userId: 1, value: 3333 }, { userId: 2, value: 3333 }, { userId: 3, value: 3334 }]);
    expect(sum(r)).toBe(1001);
  });
  it('shares 2/1/1 of 400', () => {
    const r = computeSplit(40000, 'SHARES', [{ userId: 1, value: 2 }, { userId: 2, value: 1 }, { userId: 3, value: 1 }]);
    expect(r.map((a) => a.sharePaise)).toEqual([20000, 10000, 10000]);
  });
  it('rejects invalid input', () => {
    expect(() => computeSplit(0, 'EQUAL', ids(1))).toThrow();
    expect(() => computeSplit(-5, 'EQUAL', ids(1))).toThrow();
    expect(() => computeSplit(10.5, 'EQUAL', ids(1))).toThrow();
    expect(() => computeSplit(100, 'EQUAL', [])).toThrow();
    expect(() => computeSplit(100, 'EQUAL', ids(1, 1))).toThrow();
    expect(() => computeSplit(100, 'SHARES', [{ userId: 1, value: 0 }])).toThrow();
  });
});

const exp = (o: Partial<LedgerExpense> & Pick<LedgerExpense, 'id' | 'amountPaise' | 'allocations'>): LedgerExpense => ({
  category: 'FOOD', status: 'APPROVED', payerType: 'INDIVIDUAL', payerUserId: 1, payerConfirmed: true, ...o,
});
type Ap = 'APPROVED' | 'PENDING' | 'DECLINED';
const A = (userId: number, sharePaise: number, approval: Ap = 'APPROVED') => ({ userId, sharePaise, approval });
const net = (l: ReturnType<typeof computeLedger>, id: number) => l.balances.find((b) => b.userId === id)?.netPaise ?? 0;

describe('ledger', () => {
  it('spec example: payer pays 300, equal split of 3', () => {
    const l = computeLedger([exp({ id: 1, amountPaise: 30000, allocations: [A(1, 10000), A(2, 10000), A(3, 10000)] })], []);
    expect([net(l, 1), net(l, 2), net(l, 3)]).toEqual([20000, -10000, -10000]);
    expect(simplifyDebts(l.balances)).toEqual([
      { fromUserId: 2, toUserId: 1, amountPaise: 10000 },
      { fromUserId: 3, toUserId: 1, amountPaise: 10000 },
    ]);
  });
  it('college-sponsored: zero member debt, counted in total', () => {
    const e = exp({ id: 1, amountPaise: 300000, payerType: 'COLLEGE', payerUserId: null, allocations: Array.from({ length: 10 }, (_, i) => A(i + 1, 30000)) });
    const l = computeLedger([e], [], [1, 2, 3]);
    expect(l.totals).toMatchObject({ totalPaise: 300000, sponsoredPaise: 300000, groupPaise: 0 });
    expect(l.balances.every((b) => b.netPaise === 0)).toBe(true);
  });
  it('personal expense creates no debt', () => {
    const l = computeLedger([exp({ id: 1, category: 'PERSONAL', payerUserId: 5, amountPaise: 50000, allocations: [A(5, 50000)] })], []);
    expect(l.totals.personalPaise).toBe(50000);
    expect(l.balances.find((b) => b.userId === 5)!.personalPaise).toBe(50000);
    expect(net(l, 5)).toBe(0);
  });
  it('approval: pending and declined shares are not debt', () => {
    const e = exp({ id: 1, amountPaise: 90000, allocations: [A(1, 30000), A(2, 30000, 'APPROVED'), A(3, 30000, 'DECLINED')] });
    const l = computeLedger([e], []);
    expect(net(l, 2)).toBe(-30000);
    expect(net(l, 3)).toBe(0);
    expect(net(l, 1)).toBe(30000);
    expect(l.totals.pendingPaise).toBe(30000);
    const l2 = computeLedger([exp({ id: 1, amountPaise: 90000, allocations: [A(1, 30000), A(2, 30000, 'PENDING'), A(3, 30000, 'PENDING')] })], []);
    expect(l2.balances.every((b) => b.netPaise === 0)).toBe(true);
  });
  it('unconfirmed group-member payer counts nothing', () => {
    const l = computeLedger([exp({ id: 1, amountPaise: 1000, payerConfirmed: false, allocations: [A(1, 500), A(2, 500)] })], []);
    expect(l.balances.every((b) => b.netPaise === 0)).toBe(true);
  });
  it('cancelled expenses are ignored', () => {
    const l = computeLedger([exp({ id: 1, status: 'CANCELLED', amountPaise: 1000, allocations: [A(1, 500), A(2, 500)] })], []);
    expect(l.totals.totalPaise).toBe(0);
  });
  it('everyone pays different amounts; balances sum to zero', () => {
    const es = [
      exp({ id: 1, payerUserId: 1, amountPaise: 90000, allocations: [A(1, 30000), A(2, 30000), A(3, 30000)] }),
      exp({ id: 2, payerUserId: 2, amountPaise: 60000, allocations: [A(1, 20000), A(2, 20000), A(3, 20000)] }),
      exp({ id: 3, payerUserId: 3, amountPaise: 15000, allocations: [A(1, 5000), A(3, 10000)] }),
    ];
    const l = computeLedger(es, []);
    expect(l.balances.reduce((a, b) => a + b.netPaise, 0)).toBe(0);
    expect(net(l, 1)).toBe(90000 - 30000 - 20000 - 5000);
    expect(net(l, 2)).toBe(60000 - 30000 - 20000);
    expect(net(l, 3)).toBe(15000 - 30000 - 20000 - 10000);
  });
  it('confirmed settlement reduces balance (partial ok); unconfirmed does not', () => {
    const e = exp({ id: 1, amountPaise: 30000, allocations: [A(1, 10000), A(2, 10000), A(3, 10000)] });
    const l = computeLedger([e], [
      { fromUserId: 2, toUserId: 1, amountPaise: 4000, status: 'CONFIRMED' },
      { fromUserId: 3, toUserId: 1, amountPaise: 10000, status: 'PAID' },
    ]);
    expect(net(l, 2)).toBe(-6000);
    expect(net(l, 3)).toBe(-10000);
    expect(net(l, 1)).toBe(16000);
  });
  it('simplification conserves money with at most n-1 transfers', () => {
    const nets = [{ userId: 1, netPaise: 5000 }, { userId: 2, netPaise: 3000 }, { userId: 3, netPaise: -4000 }, { userId: 4, netPaise: -2500 }, { userId: 5, netPaise: -1500 }, { userId: 6, netPaise: 0 }];
    const t = simplifyDebts(nets);
    expect(t.length).toBeLessThanOrEqual(4);
    const bal = new Map(nets.map((n) => [n.userId, n.netPaise]));
    for (const x of t) {
      bal.set(x.fromUserId, bal.get(x.fromUserId)! + x.amountPaise);
      bal.set(x.toUserId, bal.get(x.toUserId)! - x.amountPaise);
    }
    expect([...bal.values()].every((v) => v === 0)).toBe(true);
  });
  it('zero net generates no transfers', () => {
    expect(simplifyDebts([{ userId: 1, netPaise: 0 }, { userId: 2, netPaise: 0 }])).toEqual([]);
  });
});
