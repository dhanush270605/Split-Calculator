import { z } from 'zod';
import type { DB } from '../db.js';
import type { AuthUser } from '../auth.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../errors.js';
import { audit, notify, notifyAdmins, camel } from '../helpers.js';
import { computeSplit, SplitError } from '../engine/split.js';
import { formatINR } from '../engine/money.js';
import { getEventRow, isActiveMember, membership, getExpenseForUser, isInvolved } from '../access.js';
import {
  CATEGORIES, PAYMENT_METHODS, SPLIT_METHODS, PAYER_TYPES, paise, optStr, isoDate, parse,
} from '../validate.js';

export const participantSchema = z.object({ userId: z.number().int().positive(), value: z.number().int().min(0).optional() });

const base = {
  title: z.string().trim().min(1).max(200),
  description: optStr(2000),
  category: z.enum(CATEGORIES),
  subcategory: optStr(100),
  amountPaise: paise,
  paymentMethod: z.enum(PAYMENT_METHODS),
  payerType: z.enum(PAYER_TYPES).default('INDIVIDUAL'),
  payerUserId: z.number().int().positive().optional().nullable(),
  payerName: optStr(120),
  splitMethod: z.enum(SPLIT_METHODS).default('EQUAL'),
  participants: z.array(participantSchema).min(1).max(200),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
  privateReason: optStr(500),
  spentAt: isoDate,
  location: optStr(200),
  fromLocation: optStr(200),
  toLocation: optStr(200),
  transportMode: optStr(50),
  travelSegmentId: z.number().int().positive().optional().nullable(),
  notes: optStr(2000),
};
export const createExpenseSchema = z.object({
  eventId: z.number().int().positive(),
  ...base,
  idempotencyKey: z.string().min(8).max(100).optional(),
  confirmDuplicate: z.boolean().optional(),
});
export const updateExpenseSchema = z.object({
  expectedVersion: z.number().int().positive(),
  ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])) as { [K in keyof typeof base]: z.ZodOptional<(typeof base)[K]> },
  resubmit: z.boolean().optional(),
  reason: optStr(500),
});

const EXPENSE_OPEN_EVENT = new Set(['UPCOMING', 'ACTIVE']);

export function assertEventAcceptsExpenses(user: AuthUser, ev: { status: string }) {
  if (user.role === 'ADMIN') return;
  if (!EXPENSE_OPEN_EVENT.has(ev.status)) {
    throw new AppError(409, `Expenses cannot be added or changed while the event is ${ev.status.toLowerCase()}`, 'EVENT_STATE');
  }
}

interface Normalized {
  payerType: string; payerUserId: number | null; payerName: string | null; payerConfirmed: boolean;
  allocations: { userId: number; sharePaise: number; splitValue: number | null }[];
  splitMethod: string;
}

/** Validates payer/participants against event membership and computes allocations. Pure validation + math; no writes. */
function normalize(db: DB, user: AuthUser, eventId: number, d: {
  category: string; amountPaise: number; payerType: string; payerUserId?: number | null; payerName?: string | null;
  splitMethod: string; participants: { userId: number; value?: number }[];
}, creatorId: number): Normalized {
  const isAdmin = user.role === 'ADMIN';
  let { payerType, payerUserId = null, payerName = null } = d;
  let splitMethod = d.splitMethod;
  let participants = d.participants;
  let payerConfirmed = true;

  if (d.category === 'PERSONAL') {
    if (payerType !== 'INDIVIDUAL') throw badRequest('A personal expense must be paid by an individual');
    payerUserId = isAdmin && payerUserId ? payerUserId : creatorId;
    if (!isAdmin && payerUserId !== creatorId) throw forbidden('A personal expense can only be for yourself');
    participants = [{ userId: payerUserId }];
    splitMethod = 'EQUAL';
  } else if (payerType === 'INDIVIDUAL') {
    if (payerUserId && payerUserId !== creatorId && !isAdmin) throw badRequest('Use payer type GROUP_MEMBER to record an expense paid by someone else');
    payerUserId = isAdmin && payerUserId ? payerUserId : creatorId;
  } else if (payerType === 'GROUP_MEMBER') {
    if (!payerUserId) throw badRequest('payerUserId is required for a group-member payer');
    if (payerUserId === creatorId) payerType = 'INDIVIDUAL';
    else if (!isAdmin) payerConfirmed = false; // the named payer must confirm they paid
  } else {
    payerUserId = null; // sponsor: COLLEGE / ORGANIZATION / OTHER
    payerName = payerName || (payerType === 'COLLEGE' ? 'College' : payerType === 'ORGANIZATION' ? 'Organization' : 'Sponsor');
  }
  if (payerUserId && !isActiveMember(db, eventId, payerUserId)) throw badRequest('The payer is not an active participant of this event');

  for (const p of participants) {
    if (!isActiveMember(db, eventId, p.userId)) throw badRequest(`User ${p.userId} is not an active participant of this event`);
  }
  let allocations;
  try {
    allocations = computeSplit(d.amountPaise, splitMethod as any, participants);
  } catch (e) {
    if (e instanceof SplitError) throw badRequest(e.message);
    throw e;
  }
  const valueOf = new Map(participants.map((p) => [p.userId, p.value ?? null]));
  return {
    payerType, payerUserId, payerName, payerConfirmed, splitMethod,
    allocations: allocations.map((a) => ({ ...a, splitValue: valueOf.get(a.userId) ?? null })),
  };
}

const isSponsored = (t: string) => t !== 'INDIVIDUAL' && t !== 'GROUP_MEMBER';

/** Initial approval status for an allocation. */
function initialApproval(n: Normalized, category: string, userId: number, creatorId: number): 'APPROVED' | 'PENDING' {
  if (category === 'PERSONAL' || isSponsored(n.payerType)) return 'APPROVED';
  if (userId === creatorId) return 'APPROVED';
  if (userId === n.payerUserId && n.payerConfirmed) return 'APPROVED';
  return 'PENDING';
}

export function recomputeStatus(db: DB, expenseId: number) {
  const e = db.prepare(`SELECT status, payer_confirmed FROM expenses WHERE id=?`).get(expenseId) as any;
  if (!e || e.status === 'CANCELLED' || e.status === 'SETTLED') return e?.status;
  const openDispute = db.prepare(`SELECT 1 FROM disputes WHERE expense_id=? AND status IN ('OPEN','UNDER_REVIEW')`).get(expenseId);
  const counts = db.prepare(`SELECT approval_status s, COUNT(*) c FROM expense_allocations WHERE expense_id=? GROUP BY approval_status`).all(expenseId) as any[];
  const has = (s: string) => counts.some((c) => c.s === s && c.c > 0);
  let status = 'APPROVED';
  if (openDispute) status = 'DISPUTED';
  else if (has('DECLINED')) status = 'DECLINED';
  else if (has('PENDING') || !e.payer_confirmed) status = 'PENDING_APPROVAL';
  db.prepare(`UPDATE expenses SET status=? WHERE id=?`).run(status, expenseId);
  return status;
}

export function expenseDetail(db: DB, user: AuthUser, expenseId: number) {
  const e = getExpenseForUser(db, user, expenseId);
  const allocations = db.prepare(
    `SELECT a.user_id, u.name, a.share_paise, a.split_value, a.approval_status, a.responded_at, a.response_note
     FROM expense_allocations a JOIN users u ON u.id=a.user_id WHERE a.expense_id=? ORDER BY u.name`,
  ).all(expenseId);
  const involved = user.role === 'ADMIN' || isInvolved(db, e, user.id);
  const attachments = db.prepare(`SELECT id, original_name, mime, size, kind, uploader_id, created_at FROM attachments WHERE entity_type='EXPENSE' AND entity_id=?`).all(expenseId);
  const disputes = db.prepare(
    `SELECT d.*, u.name raised_by_name FROM disputes d JOIN users u ON u.id=d.raised_by WHERE d.expense_id=? ORDER BY d.id DESC`,
  ).all(expenseId).filter((d: any) => user.role === 'ADMIN' || d.raised_by === user.id || e.creator_id === user.id);
  const names = db.prepare(`SELECT id, name FROM users WHERE id IN (?,?)`).all(e.creator_id, e.payer_user_id ?? e.creator_id) as any[];
  const nm = (i: number | null) => names.find((n) => n.id === i)?.name ?? null;
  const history = involved && (user.role === 'ADMIN' || e.creator_id === user.id)
    ? db.prepare(`SELECT id, actor_name, action, created_at, metadata FROM audit_logs WHERE entity_type='EXPENSE' AND entity_id=? ORDER BY id DESC LIMIT 50`).all(expenseId)
    : [];
  const out = camel(e);
  // The private reason follows the same visibility rule as the expense itself (already filtered by getExpenseForUser).
  return {
    ...out, creatorName: nm(e.creator_id), payerDisplayName: e.payer_user_id ? nm(e.payer_user_id) : e.payer_name,
    allocations: allocations.map(camel), attachments: attachments.map(camel), disputes: disputes.map(camel), history: history.map(camel),
  };
}

function snapshot(db: DB, expenseId: number) {
  const e = db.prepare(`SELECT * FROM expenses WHERE id=?`).get(expenseId) as any;
  const a = db.prepare(`SELECT user_id, share_paise, approval_status FROM expense_allocations WHERE expense_id=? ORDER BY user_id`).all(expenseId);
  return { ...camel(e), allocations: a.map(camel) };
}

export function createExpense(db: DB, user: AuthUser, raw: unknown) {
  const d = parse(createExpenseSchema, raw);
  if (d.idempotencyKey) {
    const existing = db.prepare(`SELECT id, creator_id FROM expenses WHERE idempotency_key=?`).get(d.idempotencyKey) as any;
    if (existing) {
      if (existing.creator_id !== user.id) throw conflict('Idempotency key already used');
      return { expense: expenseDetail(db, user, existing.id), duplicate: true };
    }
  }
  const ev = getEventRow(db, d.eventId);
  if (user.role !== 'ADMIN' && !isActiveMember(db, d.eventId, user.id)) {
    if (membership(db, d.eventId, user.id) !== null) throw forbidden('You are no longer an active participant of this event');
    throw notFound('Event not found');
  }
  assertEventAcceptsExpenses(user, ev);

  if (!d.confirmDuplicate && !d.idempotencyKey) {
    const dup = db.prepare(
      `SELECT id FROM expenses WHERE event_id=? AND creator_id=? AND amount_paise=? AND title=? AND status<>'CANCELLED' AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 minutes')`,
    ).get(d.eventId, user.id, d.amountPaise, d.title);
    if (dup) throw conflict('This looks like a duplicate of an expense you just added. Resend with confirmDuplicate to add it anyway.', { duplicateOf: (dup as any).id });
  }
  if (d.travelSegmentId) {
    const seg = db.prepare(`SELECT event_id FROM travel_segments WHERE id=?`).get(d.travelSegmentId) as any;
    if (!seg || seg.event_id !== d.eventId) throw badRequest('Travel segment does not belong to this event');
  }
  const n = normalize(db, user, d.eventId, d, user.id);

  const tx = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO expenses (event_id, creator_id, title, description, category, subcategory, amount_paise, payer_type, payer_user_id, payer_name, payer_confirmed,
         payment_method, split_method, visibility, private_reason, spent_at, location, from_location, to_location, transport_mode, travel_segment_id, notes, idempotency_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      d.eventId, user.id, d.title, d.description ?? null, d.category, d.subcategory ?? null, d.amountPaise, n.payerType, n.payerUserId, n.payerName,
      n.payerConfirmed ? 1 : 0, d.paymentMethod, n.splitMethod, d.visibility, d.visibility === 'PRIVATE' ? d.privateReason ?? null : null,
      d.spentAt, d.location ?? null, d.fromLocation ?? null, d.toLocation ?? null, d.transportMode ?? null, d.travelSegmentId ?? null, d.notes ?? null,
      d.idempotencyKey ?? null,
    );
    const id = Number(info.lastInsertRowid);
    const ins = db.prepare(`INSERT INTO expense_allocations (expense_id, user_id, share_paise, split_value, approval_status, responded_at) VALUES (?,?,?,?,?,?)`);
    for (const a of n.allocations) {
      const ap = initialApproval(n, d.category, a.userId, user.id);
      ins.run(id, a.userId, a.sharePaise, a.splitValue, ap, ap === 'APPROVED' ? new Date().toISOString() : null);
    }
    recomputeStatus(db, id);
    audit(db, user, 'EXPENSE_CREATED', 'EXPENSE', id, { eventId: d.eventId, next: snapshot(db, id), metadata: { visibility: d.visibility } });
    // Approval requests
    const who = [user.name];
    for (const a of n.allocations) {
      if (a.userId === user.id) continue;
      if (initialApproval(n, d.category, a.userId, user.id) === 'PENDING') {
        notify(db, [a.userId], {
          type: 'APPROVAL_REQUESTED', level: 'ACTION_REQUIRED', title: `Approve your share: ${d.title}`,
          body: `${user.name} added "${d.title}" (${formatINR(d.amountPaise)}, ${ev.name}). Your share is ${formatINR(a.sharePaise)}.`,
          entityType: 'EXPENSE', entityId: id, eventId: d.eventId,
        });
      } else if (!isSponsored(n.payerType) && d.category !== 'PERSONAL') {
        notify(db, [a.userId], { type: 'EXPENSE_CREATED', title: `New expense: ${d.title}`, body: `${user.name} added ${formatINR(d.amountPaise)}; your share ${formatINR(a.sharePaise)}.`, entityType: 'EXPENSE', entityId: id, eventId: d.eventId });
      }
    }
    if (!n.payerConfirmed && n.payerUserId) {
      notify(db, [n.payerUserId], {
        type: 'PAYER_CONFIRMATION', level: 'ACTION_REQUIRED', title: `Confirm you paid: ${d.title}`,
        body: `${user.name} recorded that you paid ${formatINR(d.amountPaise)} for "${d.title}".`, entityType: 'EXPENSE', entityId: id, eventId: d.eventId,
      });
    }
    notifyAdmins(db, {
      type: d.visibility === 'PRIVATE' ? 'PRIVATE_EXPENSE' : 'EXPENSE_CREATED', level: d.visibility === 'PRIVATE' ? 'WARNING' : 'INFO',
      title: `${d.visibility === 'PRIVATE' ? 'Private expense' : 'Expense'}: ${d.title} ${formatINR(d.amountPaise)}`,
      body: `${who[0]} in ${ev.name}`, entityType: 'EXPENSE', entityId: id, eventId: d.eventId,
    }, user.id);
    return id;
  });
  const id = tx();
  return { expense: expenseDetail(db, user, id), duplicate: false };
}

const MATERIAL = ['amountPaise', 'category', 'payerType', 'payerUserId', 'splitMethod'] as const;

export function updateExpense(db: DB, user: AuthUser, expenseId: number, raw: unknown) {
  const d = parse(updateExpenseSchema, raw);
  const cur = getExpenseForUser(db, user, expenseId);
  const isAdmin = user.role === 'ADMIN';
  if (!isAdmin && cur.creator_id !== user.id) throw forbidden('Only the creator or an admin can edit this expense');
  if (['CANCELLED'].includes(cur.status) || (cur.status === 'SETTLED' && !isAdmin)) throw new AppError(409, `A ${cur.status.toLowerCase()} expense cannot be edited`, 'EXPENSE_STATE');
  if (isAdmin && cur.creator_id !== user.id && !d.reason) throw badRequest('Admins must provide a reason when correcting someone else\'s expense');
  if (d.expectedVersion !== cur.version) throw conflict('This expense was changed by someone else. Reload and try again.', { currentVersion: cur.version });
  const ev = getEventRow(db, cur.event_id);
  assertEventAcceptsExpenses(user, ev);

  const before = snapshot(db, expenseId);
  const curAllocs = db.prepare(`SELECT * FROM expense_allocations WHERE expense_id=?`).all(expenseId) as any[];
  const merged = {
    category: d.category ?? cur.category,
    amountPaise: d.amountPaise ?? cur.amount_paise,
    payerType: d.payerType ?? cur.payer_type,
    payerUserId: d.payerUserId !== undefined ? d.payerUserId : cur.payer_user_id,
    payerName: d.payerName !== undefined ? d.payerName : cur.payer_name,
    splitMethod: d.splitMethod ?? cur.split_method,
    participants: d.participants ?? curAllocs.map((a) => ({
      userId: a.user_id,
      value: cur.split_method === 'EQUAL' ? undefined : cur.split_method === 'CUSTOM' || cur.split_method === 'EXACT' ? a.share_paise : a.split_value ?? undefined,
    })),
  };
  // If only the amount changes for a non-equal split without new participant values, shares can't be inferred.
  if (d.amountPaise !== undefined && !d.participants && ['CUSTOM', 'EXACT'].includes(merged.splitMethod)) {
    throw badRequest('Changing the amount of a custom/exact split requires new participant values');
  }
  // creator for approval purposes is the original creator
  const n = normalize(db, user, cur.event_id, merged, cur.creator_id);
  const materialChanged = MATERIAL.some((k) => d[k] !== undefined && (d as any)[k] !== (k === 'amountPaise' ? cur.amount_paise : k === 'payerType' ? cur.payer_type : k === 'payerUserId' ? cur.payer_user_id : k === 'splitMethod' ? cur.split_method : cur.category));
  const oldByUser = new Map(curAllocs.map((a) => [a.user_id, a]));
  const newIds = new Set(n.allocations.map((a) => a.userId));

  const tx = db.transaction(() => {
    const nextVis = d.visibility ?? cur.visibility;
    db.prepare(
      `UPDATE expenses SET title=?, description=?, category=?, subcategory=?, amount_paise=?, payer_type=?, payer_user_id=?, payer_name=?, payer_confirmed=?,
        payment_method=?, split_method=?, visibility=?, private_reason=?, spent_at=?, location=?, from_location=?, to_location=?, transport_mode=?, notes=?,
        version=version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
    ).run(
      d.title ?? cur.title, d.description !== undefined ? d.description : cur.description, merged.category, d.subcategory !== undefined ? d.subcategory : cur.subcategory,
      merged.amountPaise, n.payerType, n.payerUserId, n.payerName,
      // payer confirmation is kept when the payer is unchanged, otherwise re-requested (admin edits are authoritative)
      (n.payerUserId === cur.payer_user_id && n.payerType === cur.payer_type ? cur.payer_confirmed : n.payerConfirmed ? 1 : 0),
      d.paymentMethod ?? cur.payment_method, n.splitMethod, nextVis, nextVis === 'PRIVATE' ? (d.privateReason !== undefined ? d.privateReason : cur.private_reason) : null,
      d.spentAt ?? cur.spent_at, d.location !== undefined ? d.location : cur.location,
      d.fromLocation !== undefined ? d.fromLocation : cur.from_location, d.toLocation !== undefined ? d.toLocation : cur.to_location,
      d.transportMode !== undefined ? d.transportMode : cur.transport_mode, d.notes !== undefined ? d.notes : cur.notes, expenseId,
    );
    const removed = curAllocs.filter((a) => !newIds.has(a.user_id)).map((a) => a.user_id);
    for (const uid of removed) db.prepare(`DELETE FROM expense_allocations WHERE expense_id=? AND user_id=?`).run(expenseId, uid);
    const upsert = db.prepare(
      `INSERT INTO expense_allocations (expense_id,user_id,share_paise,split_value,approval_status,responded_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(expense_id,user_id) DO UPDATE SET share_paise=excluded.share_paise, split_value=excluded.split_value, approval_status=excluded.approval_status, responded_at=excluded.responded_at, response_note=CASE WHEN excluded.approval_status='PENDING' THEN NULL ELSE response_note END`,
    );
    const reask: number[] = [];
    for (const a of n.allocations) {
      const old = oldByUser.get(a.userId);
      let ap: 'APPROVED' | 'PENDING' | 'DECLINED';
      const auto = initialApproval({ ...n, payerConfirmed: n.payerUserId === cur.payer_user_id && n.payerType === cur.payer_type ? !!cur.payer_confirmed : n.payerConfirmed }, merged.category, a.userId, cur.creator_id);
      if (auto === 'APPROVED') ap = 'APPROVED';
      else if (!old || old.share_paise !== a.sharePaise || materialChanged) ap = 'PENDING';
      else if (old.approval_status === 'DECLINED' && d.resubmit) ap = 'PENDING';
      else ap = old.approval_status;
      if (ap === 'PENDING' && (!old || old.approval_status !== 'PENDING' || old.share_paise !== a.sharePaise)) reask.push(a.userId);
      upsert.run(expenseId, a.userId, a.sharePaise, a.splitValue, ap, ap === 'APPROVED' ? (old?.responded_at ?? new Date().toISOString()) : null);
    }
    recomputeStatus(db, expenseId);
    const after = snapshot(db, expenseId);
    audit(db, user, isAdmin && cur.creator_id !== user.id ? 'ADMIN_OVERRIDE' : 'EXPENSE_UPDATED', 'EXPENSE', expenseId, {
      eventId: cur.event_id, previous: before, next: after, metadata: { reason: d.reason ?? null, removed, reasked: reask },
    });
    for (const uid of reask) {
      if (uid === user.id) continue;
      const share = n.allocations.find((a) => a.userId === uid)!.sharePaise;
      notify(db, [uid], { type: 'APPROVAL_REQUESTED', level: 'ACTION_REQUIRED', title: `Re-approve your share: ${d.title ?? cur.title}`, body: `The expense changed. Your share is now ${formatINR(share)}.`, entityType: 'EXPENSE', entityId: expenseId, eventId: cur.event_id });
    }
    const informed = [...newIds, cur.creator_id, ...removed].filter((u) => u !== user.id && !reask.includes(u));
    notify(db, informed, { type: 'EXPENSE_UPDATED', title: `Expense updated: ${d.title ?? cur.title}`, body: `${user.name} edited this expense${d.reason ? ` (${d.reason})` : ''}.`, entityType: 'EXPENSE', entityId: expenseId, eventId: cur.event_id });
    notifyAdmins(db, { type: isAdmin ? 'ADMIN_OVERRIDE' : 'EXPENSE_UPDATED', title: `Expense edited: ${d.title ?? cur.title}`, body: `by ${user.name}`, entityType: 'EXPENSE', entityId: expenseId, eventId: cur.event_id }, user.id);
  });
  tx();
  return expenseDetail(db, user, expenseId);
}

export function respondToExpense(db: DB, user: AuthUser, expenseId: number, decision: 'APPROVE' | 'DECLINE', note?: string | null) {
  const e = getExpenseForUser(db, user, expenseId);
  if (['CANCELLED', 'SETTLED'].includes(e.status)) throw new AppError(409, `This expense is ${e.status.toLowerCase()}`, 'EXPENSE_STATE');
  const alloc = db.prepare(`SELECT * FROM expense_allocations WHERE expense_id=? AND user_id=?`).get(expenseId, user.id) as any;
  const isUnconfirmedPayer = e.payer_user_id === user.id && !e.payer_confirmed;
  if (!alloc && !isUnconfirmedPayer) throw forbidden('You are not asked to respond to this expense');

  const tx = db.transaction(() => {
    if (isUnconfirmedPayer) {
      if (decision === 'DECLINE') {
        db.prepare(`UPDATE expenses SET status='CANCELLED', version=version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(expenseId);
        audit(db, user, 'EXPENSE_DECLINED', 'EXPENSE', expenseId, { eventId: e.event_id, metadata: { as: 'payer', note } });
        notify(db, [e.creator_id], { type: 'APPROVAL_DECLINED', level: 'WARNING', title: `${user.name} says they did not pay: ${e.title}`, body: note ?? undefined, entityType: 'EXPENSE', entityId: expenseId, eventId: e.event_id });
        return;
      }
      db.prepare(`UPDATE expenses SET payer_confirmed=1, version=version+1 WHERE id=?`).run(expenseId);
      if (alloc) db.prepare(`UPDATE expense_allocations SET approval_status='APPROVED', responded_at=? WHERE expense_id=? AND user_id=?`).run(new Date().toISOString(), expenseId, user.id);
      audit(db, user, 'EXPENSE_APPROVED', 'EXPENSE', expenseId, { eventId: e.event_id, metadata: { as: 'payer' } });
      notify(db, [e.creator_id], { type: 'APPROVAL_APPROVED', level: 'SUCCESS', title: `${user.name} confirmed they paid: ${e.title}`, entityType: 'EXPENSE', entityId: expenseId, eventId: e.event_id });
      recomputeStatus(db, expenseId);
      return;
    }
    const target = decision === 'APPROVE' ? 'APPROVED' : 'DECLINED';
    if (alloc.approval_status === target) return; // idempotent
    db.prepare(`UPDATE expense_allocations SET approval_status=?, responded_at=?, response_note=? WHERE expense_id=? AND user_id=?`)
      .run(target, new Date().toISOString(), note ?? null, expenseId, user.id);
    db.prepare(`UPDATE expenses SET version=version+1 WHERE id=?`).run(expenseId);
    recomputeStatus(db, expenseId);
    audit(db, user, target === 'APPROVED' ? 'EXPENSE_APPROVED' : 'EXPENSE_DECLINED', 'EXPENSE', expenseId, {
      eventId: e.event_id, previous: { approval: alloc.approval_status }, next: { approval: target }, metadata: { sharePaise: alloc.share_paise, note },
    });
    const recipients = [e.creator_id, ...(e.payer_user_id ? [e.payer_user_id] : [])].filter((u) => u !== user.id);
    notify(db, recipients, {
      type: target === 'APPROVED' ? 'APPROVAL_APPROVED' : 'APPROVAL_DECLINED', level: target === 'APPROVED' ? 'SUCCESS' : 'WARNING',
      title: `${user.name} ${target === 'APPROVED' ? 'approved' : 'declined'} ${formatINR(alloc.share_paise)}: ${e.title}`,
      body: note ?? (target === 'DECLINED' ? 'Edit the expense to correct it and resubmit.' : undefined), entityType: 'EXPENSE', entityId: expenseId, eventId: e.event_id,
    });
    notifyAdmins(db, { type: target === 'APPROVED' ? 'APPROVAL_APPROVED' : 'APPROVAL_DECLINED', title: `${user.name} ${target.toLowerCase()} a share of "${e.title}"`, entityType: 'EXPENSE', entityId: expenseId, eventId: e.event_id }, user.id);
  });
  tx();
  return expenseDetail(db, user, expenseId);
}

export function cancelExpense(db: DB, user: AuthUser, expenseId: number, reason?: string | null) {
  const e = getExpenseForUser(db, user, expenseId);
  if (user.role !== 'ADMIN' && e.creator_id !== user.id) throw forbidden('Only the creator or an admin can cancel this expense');
  if (e.status === 'CANCELLED') return expenseDetail(db, user, expenseId); // idempotent
  if (e.status === 'SETTLED' && user.role !== 'ADMIN') throw new AppError(409, 'A settled expense cannot be cancelled', 'EXPENSE_STATE');
  if (user.role === 'ADMIN' && e.creator_id !== user.id && !reason) throw badRequest('Admins must provide a reason');
  db.transaction(() => {
    db.prepare(`UPDATE expenses SET status='CANCELLED', version=version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(expenseId);
    audit(db, user, user.role === 'ADMIN' && e.creator_id !== user.id ? 'ADMIN_OVERRIDE' : 'EXPENSE_CANCELLED', 'EXPENSE', expenseId, {
      eventId: e.event_id, previous: { status: e.status }, next: { status: 'CANCELLED' }, metadata: { reason },
    });
    const users = (db.prepare(`SELECT user_id FROM expense_allocations WHERE expense_id=?`).all(expenseId) as any[]).map((r) => r.user_id).concat(e.creator_id);
    notify(db, users.filter((u) => u !== user.id), { type: 'EXPENSE_CANCELLED', level: 'WARNING', title: `Expense cancelled: ${e.title}`, body: reason ?? undefined, entityType: 'EXPENSE', entityId: expenseId, eventId: e.event_id });
  })();
  return expenseDetail(db, user, expenseId);
}

export function disputeExpense(db: DB, user: AuthUser, expenseId: number, input: { reason: string; message?: string | null }) {
  const e = getExpenseForUser(db, user, expenseId);
  if (user.role !== 'ADMIN' && !isInvolved(db, e, user.id)) throw forbidden('Only people involved in an expense can dispute it');
  if (['CANCELLED'].includes(e.status)) throw new AppError(409, 'This expense is cancelled', 'EXPENSE_STATE');
  const open = db.prepare(`SELECT id FROM disputes WHERE expense_id=? AND raised_by=? AND status IN ('OPEN','UNDER_REVIEW')`).get(expenseId, user.id) as any;
  if (open) throw conflict('You already have an open dispute on this expense', { disputeId: open.id });
  let disputeId = 0;
  db.transaction(() => {
    disputeId = Number(db.prepare(`INSERT INTO disputes (expense_id, raised_by, reason, message) VALUES (?,?,?,?)`).run(expenseId, user.id, input.reason, input.message ?? null).lastInsertRowid);
    recomputeStatus(db, expenseId);
    audit(db, user, 'EXPENSE_DISPUTED', 'EXPENSE', expenseId, { eventId: e.event_id, metadata: { disputeId, reason: input.reason } });
    notifyAdmins(db, { type: 'EXPENSE_DISPUTED', level: 'ACTION_REQUIRED', title: `Dispute: ${e.title}`, body: `${user.name}: ${input.reason}`, entityType: 'EXPENSE', entityId: expenseId, eventId: e.event_id });
    notify(db, [e.creator_id].filter((u) => u !== user.id), { type: 'EXPENSE_DISPUTED', level: 'WARNING', title: `${user.name} disputed: ${e.title}`, body: input.reason, entityType: 'EXPENSE', entityId: expenseId, eventId: e.event_id });
  })();
  return { disputeId, expense: expenseDetail(db, user, expenseId) };
}

export function resolveDispute(db: DB, admin: AuthUser, disputeId: number, status: 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED' | 'CORRECTED', note?: string | null) {
  const d = db.prepare(`SELECT * FROM disputes WHERE id=?`).get(disputeId) as any;
  if (!d) throw notFound('Dispute not found');
  if (status !== 'UNDER_REVIEW' && !note) throw badRequest('A resolution note is required');
  const e = db.prepare(`SELECT * FROM expenses WHERE id=?`).get(d.expense_id) as any;
  db.transaction(() => {
    db.prepare(`UPDATE disputes SET status=?, resolution_note=?, resolved_by=?, resolved_at=? WHERE id=?`)
      .run(status, note ?? d.resolution_note, status === 'UNDER_REVIEW' ? null : admin.id, status === 'UNDER_REVIEW' ? null : new Date().toISOString(), disputeId);
    recomputeStatus(db, d.expense_id);
    audit(db, admin, status === 'UNDER_REVIEW' ? 'DISPUTE_REVIEW' : 'DISPUTE_RESOLVED', 'EXPENSE', d.expense_id, { eventId: e.event_id, previous: { status: d.status }, next: { status }, metadata: { disputeId, note } });
    notify(db, [d.raised_by, e.creator_id], { type: 'DISPUTE_UPDATE', level: status === 'REJECTED' ? 'WARNING' : 'SUCCESS', title: `Dispute ${status.toLowerCase().replace('_', ' ')}: ${e.title}`, body: note ?? undefined, entityType: 'EXPENSE', entityId: d.expense_id, eventId: e.event_id });
  })();
  return db.prepare(`SELECT * FROM disputes WHERE id=?`).get(disputeId);
}
