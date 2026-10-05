import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { z } from 'zod';
import type { DB } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { AppError, badRequest, forbidden, notFound } from '../errors.js';
import { audit, notify, notifyAdmins, logSystemError, camel, camelAll } from '../helpers.js';
import { parse, optStr, intQuery } from '../validate.js';
import { canAccessAttachment, getEventRow, isActiveMember, getExpenseForUser } from '../access.js';

// ---- file type detection by magic bytes (filename / client mime are never trusted) ----
export function detectFileType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: '.png' };
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: '.webp' };
  if (buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: '.pdf' };
  return null;
}

const ENTITY_TYPES = ['EXPENSE', 'SETTLEMENT', 'TRAVEL', 'DISPUTE', 'PROFILE', 'EVENT', 'PROBLEM'] as const;

async function assertCanAttach(db: DB, user: { id: number; role: string }, type: string, entityId: number) {
  const admin = user.role === 'ADMIN';
  const u = user as any;
  switch (type) {
    case 'EXPENSE': {
      const e = await getExpenseForUser(db, u, entityId);
      if (!admin && e.creator_id !== user.id && e.payer_user_id !== user.id) throw forbidden('Only the creator or payer can attach evidence');
      return;
    }
    case 'SETTLEMENT': {
      const s = await db.get<any>(`SELECT from_user_id, to_user_id FROM settlements WHERE id=?`, entityId);
      if (!s) throw notFound('Settlement not found');
      if (!admin && s.from_user_id !== user.id && s.to_user_id !== user.id) throw forbidden();
      return;
    }
    case 'TRAVEL': {
      const t = await db.get<any>(`SELECT event_id FROM travel_segments WHERE id=?`, entityId);
      if (!t) throw notFound('Travel segment not found');
      if (!admin && !(await isActiveMember(db, t.event_id, user.id))) throw forbidden();
      return;
    }
    case 'DISPUTE': {
      const d = await db.get<any>(`SELECT raised_by FROM disputes WHERE id=?`, entityId);
      if (!d) throw notFound('Dispute not found');
      if (!admin && d.raised_by !== user.id) throw forbidden();
      return;
    }
    case 'PROFILE':
      if (!admin && entityId !== user.id) throw forbidden('You can only change your own photo');
      return;
    case 'EVENT':
      if (!admin) throw forbidden('Admin access required');
      await getEventRow(db, entityId);
      return;
    case 'PROBLEM': {
      const p = await db.get<any>(`SELECT user_id FROM problem_reports WHERE id=?`, entityId);
      if (!p) throw notFound('Report not found');
      if (!admin && p.user_id !== user.id) throw forbidden();
      return;
    }
  }
}

export function uploadsRouter(db: DB) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });
  const r = Router();
  r.use(requireAuth(db));

  r.post('/', (req, res, next) => {
    upload.single('file')(req, res, async (err: any) => {
      if (err) {
        await logSystemError(db, 'upload', err, { code: err.code }, req.user!.id, 'WARNING');
        return next(err.code === 'LIMIT_FILE_SIZE' ? new AppError(413, `File too large (max ${Math.round(config.maxUploadBytes / 1048576)} MB)`, 'FILE_TOO_LARGE') : badRequest('Upload failed'));
      }
      try {
        const body = parse(z.object({ entityType: z.enum(ENTITY_TYPES), entityId: z.coerce.number().int().positive(), kind: optStr(40) }), req.body);
        if (!req.file) throw badRequest('No file provided');
        const t = detectFileType(req.file.buffer);
        if (!t) throw badRequest('Unsupported file type. Allowed: JPG, PNG, WEBP, PDF');
        if (body.entityType === 'PROFILE' && t.mime === 'application/pdf') throw badRequest('Profile photo must be an image');
        await assertCanAttach(db, req.user!, body.entityType, body.entityId);
        const count = (await db.get<any>(`SELECT COUNT(*) c FROM attachments WHERE entity_type=? AND entity_id=?`, body.entityType, body.entityId))!.c;
        if (count >= 10 && body.entityType !== 'PROFILE') throw badRequest('Too many attachments on this item (max 10)');
        const original = path.basename(req.file.originalname || 'file').replace(/[^\w.\- ]/g, '_').slice(0, 120);
        const size = req.file.size;
        const buf = req.file.buffer;
        const id = await db.tx(async () => {
          const aid = await db.insert(`INSERT INTO attachments (entity_type,entity_id,uploader_id,original_name,mime,size,kind) VALUES (?,?,?,?,?,?,?)`,
            body.entityType, body.entityId, req.user!.id, original, t.mime, size, body.kind ?? null);
          await db.run(`INSERT INTO attachment_data (attachment_id, data) VALUES (?,?)`, aid, buf);
          if (body.entityType === 'PROFILE') await db.run(`UPDATE users SET avatar_attachment_id=? WHERE id=?`, aid, body.entityId);
          if (body.entityType === 'EVENT') await db.run(`UPDATE events SET cover_attachment_id=? WHERE id=?`, aid, body.entityId);
          await audit(db, req.user!, 'ATTACHMENT_ADDED', body.entityType, body.entityId, { metadata: { attachmentId: aid, mime: t.mime, size } });
          return aid;
        });
        res.status(201).json({ attachment: { id, originalName: original, mime: t.mime, size } });
      } catch (e) {
        if (!(e instanceof AppError)) await logSystemError(db, 'upload', e, undefined, req.user!.id);
        next(e);
      }
    });
  });

  r.get('/:id', async (req, res) => {
    const a = await db.get<any>(`SELECT * FROM attachments WHERE id=?`, Number(req.params.id));
    if (!a || !(await canAccessAttachment(db, req.user!, a))) throw notFound('File not found');
    const blob = await db.get<any>(`SELECT data FROM attachment_data WHERE attachment_id=?`, a.id);
    if (!blob) {
      await logSystemError(db, 'storage', new Error('Attachment data missing'), { attachmentId: a.id }, req.user!.id);
      throw notFound('File not found');
    }
    res.setHeader('Content-Type', a.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${a.original_name.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(blob.data));
  });

  r.delete('/:id', async (req, res) => {
    const a = await db.get<any>(`SELECT * FROM attachments WHERE id=?`, Number(req.params.id));
    if (!a || !(await canAccessAttachment(db, req.user!, a))) throw notFound('File not found');
    if (req.user!.role !== 'ADMIN' && a.uploader_id !== req.user!.id) throw forbidden();
    await db.tx(async () => {
      await db.run(`DELETE FROM attachments WHERE id=?`, a.id); // blob removed by ON DELETE CASCADE
      await audit(db, req.user!, 'ATTACHMENT_REMOVED', a.entity_type, a.entity_id, { metadata: { attachmentId: a.id, name: a.original_name } });
    });
    res.json({ ok: true });
  });
  return r;
}

// ------------------------------------------------------------------------------------------
export function notificationsRouter(db: DB) {
  const r = Router();
  r.use(requireAuth(db));

  r.get('/', async (req, res) => {
    const u = req.user!;
    const q = req.query as Record<string, string | undefined>;
    const limit = intQuery(q.limit, 30, 1, 100), offset = intQuery(q.offset, 0, 0, 1e6);
    const where = ['user_id=?']; const params: any[] = [u.id];
    if (q.unread === 'true') where.push('read_at IS NULL');
    if (q.level) { where.push('level=?'); params.push(q.level); }
    if (q.type) { where.push('type=?'); params.push(q.type); }
    if (q.search) { where.push(`(title LIKE ? OR COALESCE(body,'') LIKE ?)`); params.push(`%${q.search}%`, `%${q.search}%`); }
    const rows = await db.all(`SELECT * FROM notifications WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, limit, offset);
    const unread = (await db.get<any>(`SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL`, u.id))!.c;
    res.json({ notifications: camelAll(rows), unreadCount: unread });
  });
  r.get('/unread-count', async (req, res) => {
    res.json({ unreadCount: (await db.get<any>(`SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL`, req.user!.id))!.c });
  });
  r.post('/read-all', async (req, res) => {
    const n = (await db.run(`UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL`, new Date().toISOString(), req.user!.id)).changes;
    res.json({ updated: n });
  });
  r.get('/:id', async (req, res) => {
    const n = await db.get(`SELECT * FROM notifications WHERE id=? AND user_id=?`, Number(req.params.id), req.user!.id);
    if (!n) throw notFound('Notification not found');
    res.json({ notification: camel(n) });
  });
  r.post('/:id/read', async (req, res) => {
    const c = (await db.run(`UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?`, new Date().toISOString(), Number(req.params.id), req.user!.id)).changes;
    if (!c) throw notFound('Notification not found');
    res.json({ ok: true });
  });

  // Admin broadcast to event participants
  r.post('/broadcast', requireAdmin, async (req, res) => {
    const d = parse(z.object({ eventId: z.number().int().positive().optional(), userIds: z.array(z.number().int().positive()).optional(), title: z.string().trim().min(1).max(200), body: optStr(1000), level: z.enum(['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'ACTION_REQUIRED']).default('INFO') }), req.body);
    let ids = d.userIds ?? [];
    if (d.eventId) ids = ids.concat((await db.all<any>(`SELECT user_id FROM event_participants WHERE event_id=? AND status='ACTIVE'`, d.eventId)).map((r) => r.user_id));
    if (!ids.length) throw badRequest('No recipients');
    await db.tx(async () => {
      await notify(db, ids, { type: 'ADMIN_MESSAGE', level: d.level, title: d.title, body: d.body ?? undefined, eventId: d.eventId });
      await audit(db, req.user!, 'ADMIN_MESSAGE', d.eventId ? 'EVENT' : 'USER', d.eventId ?? null, { eventId: d.eventId, metadata: { title: d.title, recipients: ids.length } });
    });
    res.json({ sent: new Set(ids).size });
  });
  return r;
}

// ------------------------------------------------------------------------------------------
export function problemsRouter(db: DB) {
  const r = Router();
  r.use(requireAuth(db));

  r.post('/problems', async (req, res) => {
    const d = parse(z.object({
      title: z.string().trim().min(3).max(200), description: z.string().trim().min(5).max(4000),
      category: z.enum(['BUG', 'PAYMENT', 'ACCOUNT', 'NOTIFICATION', 'UPLOAD', 'OTHER']).default('OTHER'), deviceInfo: optStr(500),
    }), req.body);
    const id = await db.tx(async () => {
      const pid = await db.insert(`INSERT INTO problem_reports (user_id,title,description,category,device_info) VALUES (?,?,?,?,?)`, req.user!.id, d.title, d.description, d.category, d.deviceInfo ?? null);
      await audit(db, req.user!, 'PROBLEM_REPORTED', 'PROBLEM', pid, { metadata: { title: d.title, category: d.category } });
      await notifyAdmins(db, { type: 'PROBLEM_REPORTED', level: 'WARNING', title: `Problem report: ${d.title}`, body: `${req.user!.name} (${d.category})`, entityType: 'PROBLEM', entityId: pid });
      return pid;
    });
    res.status(201).json({ id });
  });
  r.get('/problems/mine', async (req, res) => {
    res.json({ problems: camelAll(await db.all(`SELECT * FROM problem_reports WHERE user_id=? ORDER BY id DESC LIMIT 50`, req.user!.id)) });
  });

  // Client crash/error reporting
  r.post('/client-errors', async (req, res) => {
    const d = parse(z.object({ message: z.string().max(1000), stack: z.string().max(4000).optional(), screen: z.string().max(100).optional(), device: z.string().max(300).optional() }), req.body);
    await logSystemError(db, 'client', Object.assign(new Error(d.message), { stack: d.stack }), { screen: d.screen, device: d.device }, req.user!.id);
    res.status(202).json({ ok: true });
  });

  // Admin triage
  r.get('/admin/problems', requireAdmin, async (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const q = `%${String(req.query.search ?? '')}%`;
    const rows = await db.all(
      `SELECT p.*, u.name user_name FROM problem_reports p JOIN users u ON u.id=p.user_id WHERE (? IS NULL OR p.status=?) AND (p.title LIKE ? OR p.description LIKE ?) ORDER BY p.id DESC LIMIT 200`,
      status, status, q, q);
    res.json({ problems: camelAll(rows) });
  });
  r.patch('/admin/problems/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const d = parse(z.object({ status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED']).optional(), adminNote: optStr(2000) }), req.body);
    const p = await db.get<any>(`SELECT * FROM problem_reports WHERE id=?`, id);
    if (!p) throw notFound('Report not found');
    await db.tx(async () => {
      await db.run(`UPDATE problem_reports SET status=COALESCE(?,status), admin_note=COALESCE(?,admin_note), resolved_by=CASE WHEN COALESCE(?,'')='RESOLVED' THEN ?::int ELSE resolved_by END, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
        d.status ?? null, d.adminNote ?? null, d.status ?? null, req.user!.id, id);
      await audit(db, req.user!, 'PROBLEM_UPDATED', 'PROBLEM', id, { previous: { status: p.status }, next: { status: d.status ?? p.status }, metadata: { note: d.adminNote } });
      await notify(db, [p.user_id], { type: 'PROBLEM_UPDATE', level: d.status === 'RESOLVED' ? 'SUCCESS' : 'INFO', title: `Your report "${p.title}" is ${(d.status ?? p.status).toLowerCase()}`, body: d.adminNote ?? undefined, entityType: 'PROBLEM', entityId: id });
    });
    res.json({ problem: camel(await db.get(`SELECT * FROM problem_reports WHERE id=?`, id)) });
  });
  return r;
}
