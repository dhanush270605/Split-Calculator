import { z, ZodType } from 'zod';
import { badRequest } from './errors.js';
import { MAX_AMOUNT_PAISE } from './engine/money.js';

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw badRequest(`Invalid input: ${issues.map((i) => `${i.field || 'body'} ${i.message}`).join('; ')}`, issues);
  }
  return r.data;
}

export const CATEGORIES = ['FOOD', 'TRAVEL', 'ACCOMMODATION', 'HACKATHON', 'PERSONAL', 'SHOPPING', 'TICKETS', 'MEDICAL', 'OTHER'] as const;
export const PAYMENT_METHODS = ['UPI', 'CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'] as const;
export const SPLIT_METHODS = ['EQUAL', 'CUSTOM', 'PERCENTAGE', 'SHARES', 'EXACT'] as const;
export const PAYER_TYPES = ['INDIVIDUAL', 'GROUP_MEMBER', 'COLLEGE', 'ORGANIZATION', 'OTHER'] as const;
export const TRANSPORT = ['BUS', 'TRAIN', 'FLIGHT', 'TAXI', 'CAB', 'AUTO', 'RICKSHAW', 'CAR', 'BIKE', 'RENTAL', 'METRO', 'OTHER'] as const;
export const EVENT_STATUSES = ['DRAFT', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED'] as const;
export const EVENT_TYPES = ['TRIP', 'HACKATHON', 'HACKATHON_TRIP'] as const;

export const paise = z.number().int().positive().max(MAX_AMOUNT_PAISE);
export const optStr = (max = 500) => z.string().trim().max(max).optional().nullable();
export const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be a valid date');
export const id = z.coerce.number().int().positive();

export const intQuery = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
};
