import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { get, patch, post, newKey, uploadAttachment, ApiError } from '@/lib/api';
import { submitOrQueue } from '@/lib/queue';
import { useAuth } from '@/lib/auth';
import { errMsg, useDebounced, useLoad } from '@/lib/hooks';
import { formatINR, parseRupees, pctToBp } from '@/lib/money';
import { Banner, Btn, Card, Chips, Field, KV, Loading, Row, Screen, SectionTitle, Txt, confirm, notice } from '@/ui/components';
import { label } from '@/ui/theme';

const CATS = ['FOOD', 'TRAVEL', 'ACCOMMODATION', 'HACKATHON', 'PERSONAL', 'SHOPPING', 'TICKETS', 'MEDICAL', 'OTHER'];
const SUBS: Record<string, string[]> = {
  FOOD: ['breakfast', 'lunch', 'dinner', 'snacks', 'beverages', 'water'], TRAVEL: ['bus', 'train', 'flight', 'cab', 'auto', 'metro', 'fuel', 'parking', 'toll'],
  ACCOMMODATION: ['hotel', 'hostel', 'room', 'booking'], HACKATHON: ['registration', 'materials', 'equipment', 'printing'], PERSONAL: [], SHOPPING: [], TICKETS: [], MEDICAL: [], OTHER: [],
};
const METHODS = ['UPI', 'CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'];
const SPLITS = [{ value: 'EQUAL', label: 'Equal' }, { value: 'CUSTOM', label: 'Custom ₹' }, { value: 'PERCENTAGE', label: 'Percent' }, { value: 'SHARES', label: 'Shares' }, { value: 'EXACT', label: 'Exact ₹' }];
const pad = (n: number) => String(n).padStart(2, '0');
const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toIso = (s: string) => { const d = new Date(s.trim().replace(' ', 'T')); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
const toLocal = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export default function ExpenseForm() {
  const params = useLocalSearchParams<{ eventId?: string; editId?: string }>();
  const editId = params.editId ? Number(params.editId) : null;
  const router = useRouter();
  const { me, isAdmin, refreshUnread } = useAuth();
  const key = useRef(newKey()); // one idempotency key per form instance: retries / double taps can't duplicate
  const events = useLoad(() => get('/events?limit=100'));
  const existing = useLoad(() => (editId ? get(`/expenses/${editId}`) : Promise.resolve(null)), [editId]);
  const [eventId, setEventId] = useState<number | null>(params.eventId ? Number(params.eventId) : null);
  const ev = useLoad(() => (eventId ? get(`/events/${eventId}`) : Promise.resolve(null)), [eventId]);
  const [f, setF] = useState({ title: '', description: '', category: 'FOOD', subcategory: '', amount: '', method: 'UPI', payerType: 'INDIVIDUAL', payerName: '', splitMethod: 'EQUAL', visibility: 'PUBLIC', privateReason: '', spentAt: nowLocal(), location: '', from: '', to: '', notes: '' });
  const [payerUserId, setPayerUserId] = useState<number | null>(null);
  const [parts, setParts] = useState<number[]>([]);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [files, setFiles] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ allocations?: { userId: number; sharePaise: number }[]; error?: string } | null>(null);
  const [filled, setFilled] = useState(!editId);
  const s = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const members: { id: number; name: string }[] = useMemo(() => (ev.data?.event.participants ?? []).filter((p: any) => p.status === 'ACTIVE'), [ev.data]);
  const personal = f.category === 'PERSONAL';

  // default: every active member participates (user can untick)
  useEffect(() => { if (!editId && members.length && parts.length === 0) setParts(members.map((m) => m.id)); }, [members, editId]); // eslint-disable-line

  useEffect(() => {
    const x = existing.data?.expense;
    if (!x || filled) return;
    setEventId(x.eventId);
    setF({ title: x.title, description: x.description ?? '', category: x.category, subcategory: x.subcategory ?? '', amount: (x.amountPaise / 100).toFixed(2), method: x.paymentMethod, payerType: x.payerType === 'GROUP_MEMBER' ? 'GROUP_MEMBER' : x.payerType, payerName: x.payerName ?? '', splitMethod: x.splitMethod, visibility: x.visibility, privateReason: x.privateReason ?? '', spentAt: toLocal(x.spentAt), location: x.location ?? '', from: x.fromLocation ?? '', to: x.toLocation ?? '', notes: x.notes ?? '' });
    setPayerUserId(x.payerUserId ?? null);
    setParts(x.allocations.map((a: any) => a.userId));
    setVals(Object.fromEntries(x.allocations.map((a: any) => [a.userId, x.splitMethod === 'CUSTOM' || x.splitMethod === 'EXACT' ? (a.sharePaise / 100).toFixed(2) : x.splitMethod === 'PERCENTAGE' ? ((a.splitValue ?? 0) / 100).toFixed(2) : String(a.splitValue ?? 1)])));
    setFilled(true);
  }, [existing.data, filled]);

  const amountPaise = parseRupees(f.amount);
  const participants = useMemo(() => {
    const list = personal ? [me!.id] : parts;
    return list.map((userId) => {
      if (f.splitMethod === 'EQUAL' || personal) return { userId };
      const raw = vals[userId] ?? '';
      const value = f.splitMethod === 'SHARES' ? (/^\d+$/.test(raw) ? Number(raw) : undefined) : f.splitMethod === 'PERCENTAGE' ? pctToBp(raw) ?? undefined : parseRupees(raw) ?? undefined;
      return { userId, value };
    });
  }, [parts, vals, f.splitMethod, personal, me]);

  const dbPreview = useDebounced(JSON.stringify({ amountPaise, m: personal ? 'EQUAL' : f.splitMethod, participants }), 400);
  useEffect(() => {
    const p = JSON.parse(dbPreview);
    if (!p.amountPaise || !p.participants.length) { setPreview(null); return; }
    if (p.m !== 'EQUAL' && p.participants.some((x: any) => x.value === undefined)) { setPreview({ error: 'Fill in a value for every participant' }); return; }
    post('/expenses/preview', { amountPaise: p.amountPaise, splitMethod: p.m, participants: p.participants })
      .then((r) => setPreview({ allocations: r.allocations })).catch((e) => setPreview({ error: errMsg(e) }));
  }, [dbPreview]);

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true, selectionLimit: 5 });
    if (!r.canceled) setFiles((p) => [...p, ...r.assets].slice(0, 5));
  };

  const submit = async () => {
    setError(null);
    if (!eventId) return setError('Choose an event');
    if (!f.title.trim()) return setError('Enter a description / title');
    if (!amountPaise || amountPaise <= 0) return setError('Enter a valid amount greater than zero (max two decimals)');
    const at = toIso(f.spentAt);
    if (!at) return setError('Date/time should look like 2026-12-01 14:30');
    if (!personal && parts.length === 0) return setError('Select at least one participant');
    if (f.payerType === 'GROUP_MEMBER' && !payerUserId) return setError('Choose who paid');
    if (f.visibility === 'PRIVATE' && !f.privateReason.trim() && !(await confirm('No private reason', 'Private expenses are easier to understand with a reason. Continue without one?'))) return;
    if (preview?.error) return setError(preview.error);
    const body: any = {
      eventId, title: f.title.trim(), description: f.description.trim() || null, category: f.category, subcategory: f.subcategory.trim() || null, amountPaise, paymentMethod: f.method,
      payerType: f.payerType, payerUserId: f.payerType === 'GROUP_MEMBER' ? payerUserId : undefined, payerName: ['COLLEGE', 'ORGANIZATION', 'OTHER'].includes(f.payerType) ? f.payerName.trim() || null : undefined,
      splitMethod: personal ? 'EQUAL' : f.splitMethod, participants, visibility: f.visibility, privateReason: f.visibility === 'PRIVATE' ? f.privateReason.trim() || null : null,
      spentAt: at, location: f.location.trim() || null, fromLocation: f.from.trim() || null, toLocation: f.to.trim() || null, transportMode: f.category === 'TRAVEL' ? f.subcategory || null : null, notes: f.notes.trim() || null,
    };
    try {
      let expenseId: number | null = null;
      if (editId) {
        const r = await patch(`/expenses/${editId}`, { ...body, eventId: undefined, expectedVersion: existing.data.expense.version, resubmit: true, reason: isAdmin ? 'Corrected by admin' : undefined });
        expenseId = r.expense.id;
      } else {
        const r = await submitOrQueue(`Expense: ${body.title}`, '/expenses', { ...body, idempotencyKey: key.current });
        if (r.queued) { notice('Saved offline', 'No connection. This expense is queued and will be sent automatically (safely, without duplicates) when you are back online. Evidence photos cannot be attached offline; add them afterwards.'); await refreshUnread(); router.back(); return; }
        expenseId = r.result.expense.id;
      }
      let failedUploads = 0;
      for (const [i, a] of files.entries()) {
        try { await uploadAttachment('EXPENSE', expenseId!, { uri: a.uri, name: a.fileName ?? `evidence-${i + 1}.jpg`, mimeType: a.mimeType ?? 'image/jpeg', file: (a as any).file }, 'RECEIPT'); } catch { failedUploads++; }
      }
      if (failedUploads) notice('Expense saved, but evidence failed', `${failedUploads} file(s) could not be uploaded. Open the expense and use "Add evidence" to retry.`);
      await refreshUnread();
      router.replace({ pathname: '/expense/[id]', params: { id: expenseId! } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.details?.currentVersion) { setError('Someone changed this expense while you were editing. Go back and reopen it.'); return; }
      setError(errMsg(e));
    }
  };

  if ((editId && !filled) || (events.loading && !events.data)) return <Screen><Loading /></Screen>;
  const choosable = (events.data?.events ?? []).filter((e: any) => isAdmin || ['UPCOMING', 'ACTIVE'].includes(e.status));
  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? `User ${id}`;
  const sum = (preview?.allocations ?? []).reduce((a, b) => a + b.sharePaise, 0);
  return (
    <Screen>
      {editId ? <Banner tone="warn" text="Editing may ask affected people to approve their share again." /> : null}
      <Card>
        <Txt variant="h2">{editId ? 'Edit expense' : 'Add expense'}</Txt>
        {!editId ? <Chips label="1 · Event" value={eventId} onChange={(v) => { setEventId(v); setParts([]); setPayerUserId(null); }} options={choosable.map((e: any) => ({ value: e.id, label: e.name }))} /> : null}
        {choosable.length === 0 && !editId ? <Txt variant="sub">No event is open for expenses.</Txt> : null}
        <Chips label="2 · Category" value={f.category} onChange={(v) => setF((x) => ({ ...x, category: v, subcategory: '' }))} options={CATS.map((c) => ({ value: c, label: label(c) }))} />
        {SUBS[f.category]?.length ? <Chips label="3 · Subcategory" value={f.subcategory} onChange={s('subcategory')} options={SUBS[f.category].map((c) => ({ value: c, label: label(c) }))} /> : null}
        <Field label="Custom subcategory (optional)" value={f.subcategory} onChangeText={s('subcategory')} />
        <Field label="4 · What was it for?" value={f.title} onChangeText={s('title')} placeholder="e.g. Dinner at Palakkad" />
        <Field label="Details (optional)" value={f.description} onChangeText={s('description')} multiline />
        <Field label="5 · Amount (₹)" value={f.amount} onChangeText={s('amount')} keyboardType="decimal-pad" placeholder="0.00" error={f.amount && amountPaise == null ? 'Use numbers with up to 2 decimals' : null} />
        <Chips label="6 · Payment method" value={f.method} onChange={s('method')} options={METHODS.map((m) => ({ value: m, label: label(m) }))} />
        <Field label="When" value={f.spentAt} onChangeText={s('spentAt')} placeholder="2026-12-01 14:30" />
        {f.method === 'CASH' || f.method === 'OTHER' ? <Field label="Where was it spent?" value={f.location} onChangeText={s('location')} /> : null}
        {f.category === 'TRAVEL' ? <Row><Field label="From" value={f.from} onChangeText={s('from')} /><Field label="To" value={f.to} onChangeText={s('to')} /></Row> : null}
      </Card>

      {!personal ? (
        <Card>
          <Chips label="7 · Who paid?" value={f.payerType} onChange={(v) => { s('payerType')(v); }} options={[{ value: 'INDIVIDUAL', label: 'Me' }, { value: 'GROUP_MEMBER', label: 'Another member' }, { value: 'COLLEGE', label: 'College' }, { value: 'ORGANIZATION', label: 'Organization' }, { value: 'OTHER', label: 'Other sponsor' }]} />
          {f.payerType === 'GROUP_MEMBER' ? <Chips value={payerUserId} onChange={setPayerUserId} options={members.filter((m) => m.id !== me?.id || isAdmin).map((m) => ({ value: m.id, label: m.name }))} /> : null}
          {['COLLEGE', 'ORGANIZATION', 'OTHER'].includes(f.payerType) ? <Banner tone="info" text="Sponsored: counts toward the event total but creates no debt for members." /> : null}
          {['COLLEGE', 'ORGANIZATION', 'OTHER'].includes(f.payerType) ? <Field label="Sponsor name" value={f.payerName} onChangeText={s('payerName')} /> : null}
          <Chips label="8 · Who benefited? (participants)" multi value={parts} onChange={setParts} options={members.map((m) => ({ value: m.id, label: m.name }))} />
          <Row><Btn small variant="ghost" title="Select all" onPress={() => setParts(members.map((m) => m.id))} /><Btn small variant="ghost" title="Only me" onPress={() => setParts(me ? [me.id] : [])} /></Row>
          <Chips label="9 · Split method" value={f.splitMethod} onChange={s('splitMethod')} options={SPLITS} />
          {f.splitMethod !== 'EQUAL' ? parts.map((id) => (
            <Field key={id} label={`${nameOf(id)} — ${f.splitMethod === 'PERCENTAGE' ? '%' : f.splitMethod === 'SHARES' ? 'shares' : '₹'}`} value={vals[id] ?? ''} onChangeText={(v) => setVals((x) => ({ ...x, [id]: v }))} keyboardType="decimal-pad" />
          )) : null}
          {preview?.error ? <Banner tone="warn" text={preview.error} /> : null}
          {preview?.allocations ? (
            <Card style={{ backgroundColor: undefined }}>
              <Txt variant="h3">Calculated shares</Txt>
              {preview.allocations.map((a) => <KV key={a.userId} k={nameOf(a.userId)} v={formatINR(a.sharePaise)} />)}
              <KV k="Total" v={`${formatINR(sum)} ✓`} />
            </Card>
          ) : null}
        </Card>
      ) : <Banner tone="info" text="Personal expense: only you benefit, nobody owes anything." />}

      <Card>
        <Chips label="11 · Visibility" value={f.visibility} onChange={s('visibility')} options={[{ value: 'PUBLIC', label: 'Public (all participants)' }, { value: 'PRIVATE', label: 'Private (involved + admin)' }]} />
        {f.visibility === 'PRIVATE' ? <Field label="Private reason" value={f.privateReason} onChangeText={s('privateReason')} placeholder="e.g. Personal medical expense" /> : null}
        <Field label="12 · Notes (optional)" value={f.notes} onChangeText={s('notes')} multiline />
        <SectionTitle>10 · Evidence (receipt / screenshot)</SectionTitle>
        <Row style={{ flexWrap: 'wrap' }}>{files.map((a, i) => <Image key={i} source={{ uri: a.uri }} style={{ width: 64, height: 64, borderRadius: 8 }} accessibilityLabel="Selected evidence" />)}</Row>
        <Btn small variant="secondary" icon="image-outline" title={files.length ? 'Add another' : 'Attach image'} onPress={pick} />
        {f.method === 'UPI' && files.length === 0 ? <Txt variant="small">Tip: attach the UPI payment screenshot so others can verify.</Txt> : null}
      </Card>
      {error ? <Banner tone="danger" text={error} /> : null}
      <Btn title={editId ? 'Save & resubmit' : 'Submit expense'} onPress={submit} />
      <View style={{ height: 8 }} />
    </Screen>
  );
}
