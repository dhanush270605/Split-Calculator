export type PayerType = 'INDIVIDUAL' | 'GROUP_MEMBER' | 'COLLEGE' | 'ORGANIZATION' | 'OTHER';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'DECLINED';

export interface LedgerExpense {
  id: number;
  category: string;
  status: string; // CANCELLED is excluded
  amountPaise: number;
  payerType: PayerType;
  payerUserId: number | null;
  payerConfirmed: boolean;
  allocations: { userId: number; sharePaise: number; approval: ApprovalStatus }[];
}
export interface LedgerPayment { fromUserId: number; toUserId: number; amountPaise: number; status: string }

export interface UserBalance {
  userId: number;
  paidPaise: number;       // paid out of pocket for group-split expenses
  owedPaise: number;       // own cost: confirmed share (payer also bears any unconfirmed remainder)
  personalPaise: number;   // personal spending (creates no debt)
  settledInPaise: number;  // confirmed settlement payments received
  settledOutPaise: number; // confirmed settlement payments made
  netPaise: number;        // + should receive, - owes (after confirmed settlements)
}
export interface EventTotals {
  totalPaise: number;
  sponsoredPaise: number;
  groupPaise: number;
  personalPaise: number;
  pendingPaise: number; // group money not (yet) counted in balances: awaiting approval / declined
}
export interface Transfer { fromUserId: number; toUserId: number; amountPaise: number }

const isGroupPayer = (t: PayerType) => t === 'INDIVIDUAL' || t === 'GROUP_MEMBER';

/**
 * The ONE authoritative balance calculation.
 *  - COLLEGE / ORGANIZATION / OTHER payer -> sponsored: counts toward total, zero member debt.
 *  - PERSONAL category -> personal spending, zero debt.
 *  - otherwise payer is credited; each APPROVED non-payer allocation is debited. PENDING/DECLINED never count.
 *  - Only CONFIRMED settlement payments reduce outstanding balances.
 */
export function computeLedger(expenses: LedgerExpense[], payments: LedgerPayment[], userIds: number[] = []) {
  const map = new Map<number, UserBalance>();
  const get = (id: number) => {
    let b = map.get(id);
    if (!b) map.set(id, (b = { userId: id, paidPaise: 0, owedPaise: 0, personalPaise: 0, settledInPaise: 0, settledOutPaise: 0, netPaise: 0 }));
    return b;
  };
  userIds.forEach(get);
  const totals: EventTotals = { totalPaise: 0, sponsoredPaise: 0, groupPaise: 0, personalPaise: 0, pendingPaise: 0 };

  for (const e of expenses) {
    if (e.status === 'CANCELLED') continue;
    totals.totalPaise += e.amountPaise;
    if (!isGroupPayer(e.payerType)) { totals.sponsoredPaise += e.amountPaise; continue; }
    if (e.category === 'PERSONAL') {
      totals.personalPaise += e.amountPaise;
      if (e.payerUserId != null) get(e.payerUserId).personalPaise += e.amountPaise;
      continue;
    }
    totals.groupPaise += e.amountPaise;
    if (e.payerUserId == null || !e.payerConfirmed) { totals.pendingPaise += e.amountPaise; continue; }
    const payer = get(e.payerUserId);
    let confirmedOthers = 0;
    let counted = 0;
    for (const a of e.allocations) {
      if (a.approval !== 'APPROVED') continue;
      counted += a.sharePaise;
      if (a.userId === e.payerUserId) continue;
      confirmedOthers += a.sharePaise;
      get(a.userId).owedPaise += a.sharePaise;
    }
    payer.paidPaise += e.amountPaise;
    payer.owedPaise += e.amountPaise - confirmedOthers;
    totals.pendingPaise += e.amountPaise - counted;
  }
  for (const p of payments) {
    if (p.status !== 'CONFIRMED') continue;
    get(p.fromUserId).settledOutPaise += p.amountPaise;
    get(p.toUserId).settledInPaise += p.amountPaise;
  }
  for (const b of map.values()) b.netPaise = b.paidPaise - b.owedPaise + b.settledOutPaise - b.settledInPaise;
  return { balances: [...map.values()].sort((a, b) => a.userId - b.userId), totals };
}

/** Greedy debt simplification: match largest debtor with largest creditor. At most n-1 transfers, money conserved. */
export function simplifyDebts(nets: { userId: number; netPaise: number }[]): Transfer[] {
  const cred = nets.filter((n) => n.netPaise > 0).map((n) => ({ ...n })).sort((a, b) => b.netPaise - a.netPaise || a.userId - b.userId);
  const debt = nets.filter((n) => n.netPaise < 0).map((n) => ({ userId: n.userId, netPaise: -n.netPaise })).sort((a, b) => b.netPaise - a.netPaise || a.userId - b.userId);
  const out: Transfer[] = [];
  let i = 0, j = 0;
  while (i < cred.length && j < debt.length) {
    const amt = Math.min(cred[i].netPaise, debt[j].netPaise);
    if (amt > 0) out.push({ fromUserId: debt[j].userId, toUserId: cred[i].userId, amountPaise: amt });
    cred[i].netPaise -= amt;
    debt[j].netPaise -= amt;
    if (cred[i].netPaise === 0) i++;
    if (debt[j].netPaise === 0) j++;
  }
  return out;
}
