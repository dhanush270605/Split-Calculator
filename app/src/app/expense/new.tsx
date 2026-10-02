import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { get, patch, post, newKey, uploadAttachment, ApiError } from '@/lib/api';
import { submitOrQueue } from '@/lib/queue';
import { useAuth } from '@/lib/auth';
import { errMsg, useDebounced, useLoad } from '@/lib/hooks';
import { formatINR, parseRupees, pctToBp } from '@/lib/money';
import {
  Avatar, Badge, Banner, Btn, Card, Chips, Field, KV, Loading, Money, ProgressBar, Row, Screen, SectionTitle, Txt, confirm, notice,
} from '@/ui/components';
import { label, radius, space, useTheme } from '@/ui/theme';

const CATS = [
  { value: 'FOOD', label: 'Food & Dining', icon: 'fast-food' },
  { value: 'TRAVEL', label: 'Travel & Transport', icon: 'airplane' },
  { value: 'ACCOMMODATION', label: 'Stay & Hotel', icon: 'bed' },
  { value: 'HACKATHON', label: 'Hackathon & Tech', icon: 'code-slash' },
  { value: 'PERSONAL', label: 'Personal', icon: 'person' },
  { value: 'SHOPPING', label: 'Shopping', icon: 'cart' },
  { value: 'TICKETS', label: 'Tickets & Passes', icon: 'ticket' },
  { value: 'MEDICAL', label: 'Medical & Health', icon: 'medkit' },
  { value: 'OTHER', label: 'Other', icon: 'apps' },
];

const METHODS = ['UPI', 'CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'];
const SPLITS = [
  { value: 'EQUAL', label: 'Equal (1/N)' },
  { value: 'CUSTOM', label: 'Custom (₹)' },
  { value: 'PERCENTAGE', label: 'Percent (%)' },
  { value: 'SHARES', label: 'Shares (x)' },
  { value: 'EXACT', label: 'Exact Amount (₹)' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const nowLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIso = (s: string) => {
  const d = new Date(s.trim().replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function ExpenseWizardForm() {
  const params = useLocalSearchParams<{ eventId?: string; editId?: string }>();
  const editId = params.editId ? Number(params.editId) : null;
  const router = useRouter();
  const t = useTheme();
  const { me, isAdmin, refreshUnread } = useAuth();
  const key = useRef(newKey());

  const events = useLoad(() => get('/events?limit=100'));
  const existing = useLoad(() => (editId ? get(`/expenses/${editId}`) : Promise.resolve(null)), [editId]);

  const [step, setStep] = useState(1);
  const [eventId, setEventId] = useState<number | null>(params.eventId ? Number(params.eventId) : null);
  const ev = useLoad(() => (eventId ? get(`/events/${eventId}`) : Promise.resolve(null)), [eventId]);

  const [f, setF] = useState({
    title: '', description: '', category: 'FOOD', subcategory: '', amount: '', method: 'UPI',
    payerType: 'INDIVIDUAL', payerName: '', splitMethod: 'EQUAL', visibility: 'PUBLIC',
    privateReason: '', spentAt: nowLocal(), location: '', from: '', to: '', notes: '',
  });

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

  useEffect(() => {
    if (!editId && members.length && parts.length === 0) setParts(members.map((m) => m.id));
  }, [members, editId]);

  useEffect(() => {
    const x = existing.data?.expense;
    if (!x || filled) return;
    setEventId(x.eventId);
    setF({
      title: x.title, description: x.description ?? '', category: x.category, subcategory: x.subcategory ?? '',
      amount: (x.amountPaise / 100).toFixed(2), method: x.paymentMethod, payerType: x.payerType === 'GROUP_MEMBER' ? 'GROUP_MEMBER' : x.payerType,
      payerName: x.payerName ?? '', splitMethod: x.splitMethod, visibility: x.visibility, privateReason: x.privateReason ?? '',
      spentAt: toLocal(x.spentAt), location: x.location ?? '', from: x.fromLocation ?? '', to: x.toLocation ?? '', notes: x.notes ?? '',
    });
    setPayerUserId(x.payerUserId ?? null);
    setParts(x.allocations.map((a: any) => a.userId));
    setVals(Object.fromEntries(x.allocations.map((a: any) => [
      a.userId,
      x.splitMethod === 'CUSTOM' || x.splitMethod === 'EXACT'
        ? (a.sharePaise / 100).toFixed(2)
        : x.splitMethod === 'PERCENTAGE'
        ? ((a.splitValue ?? 0) / 100).toFixed(2)
        : String(a.splitValue ?? 1),
    ])));
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
      .then((r) => setPreview({ allocations: r.allocations }))
      .catch((e) => setPreview({ error: errMsg(e) }));
  }, [dbPreview]);

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true, selectionLimit: 5 });
    if (!r.canceled) setFiles((prev) => [...prev, ...r.assets].slice(0, 5));
  };

  const validateCurrentStep = (): boolean => {
    setError(null);
    if (step === 1) {
      if (!eventId) { setError('Please select an event'); return false; }
      if (!f.title.trim()) { setError('Enter a description / title'); return false; }
      if (!amountPaise || amountPaise <= 0) { setError('Enter a valid amount greater than zero'); return false; }
      const at = toIso(f.spentAt);
      if (!at) { setError('Date should be formatted like 2026-12-01 14:30'); return false; }
    } else if (step === 2) {
      if (!personal && parts.length === 0) { setError('Select at least one participant'); return false; }
      if (f.payerType === 'GROUP_MEMBER' && !payerUserId) { setError('Select who paid for this expense'); return false; }
    } else if (step === 3) {
      if (preview?.error) { setError(preview.error); return false; }
    } else if (step === 4) {
      if (f.visibility === 'PRIVATE' && !f.privateReason.trim()) { setError('Please provide a reason for keeping this expense private'); return false; }
    }
    return true;
  };

  const nextStep = () => {
    if (validateCurrentStep()) setStep((prev) => Math.min(5, prev + 1));
  };

  const prevStep = () => {
    setError(null);
    setStep((prev) => Math.max(1, prev - 1));
  };

  const submit = async () => {
    if (!validateCurrentStep()) return;
    const at = toIso(f.spentAt)!;
    const body: any = {
      eventId, title: f.title.trim(), description: f.description.trim() || null, category: f.category, subcategory: f.subcategory.trim() || null, amountPaise, paymentMethod: f.method,
      payerType: f.payerType, payerUserId: f.payerType === 'GROUP_MEMBER' ? payerUserId : undefined, payerName: ['COLLEGE', 'ORGANIZATION', 'OTHER'].includes(f.payerType) ? f.payerName.trim() || null : undefined,
      splitMethod: personal ? 'EQUAL' : f.splitMethod, participants, visibility: f.visibility, privateReason: f.visibility === 'PRIVATE' ? f.privateReason.trim() || null : null,
      spentAt: at, location: f.location.trim() || null, fromLocation: f.from.trim() || null, toLocation: f.to.trim() || null, transportMode: f.category === 'TRAVEL' ? f.subcategory || null : null, notes: f.notes.trim() || null,
    };

    try {
      let expenseId: number | null = null;
      if (editId) {
        const res = await patch(`/expenses/${editId}`, { ...body, eventId: undefined, expectedVersion: existing.data.expense.version, resubmit: true, reason: isAdmin ? 'Corrected by admin' : undefined });
        expenseId = res.expense.id;
      } else {
        const res = await submitOrQueue(`Expense: ${body.title}`, '/expenses', { ...body, idempotencyKey: key.current });
        if (res.queued) {
          notice('Saved offline', 'No network connection. Expense queued for automatic background sync.');
          await refreshUnread();
          router.back();
          return;
        }
        expenseId = res.result.expense.id;
      }

      let failedUploads = 0;
      for (const [i, a] of files.entries()) {
        try {
          await uploadAttachment('EXPENSE', expenseId!, { uri: a.uri, name: a.fileName ?? `evidence-${i + 1}.jpg`, mimeType: a.mimeType ?? 'image/jpeg', file: (a as any).file }, 'RECEIPT');
        } catch {
          failedUploads++;
        }
      }
      if (failedUploads) notice('Saved with warning', `${failedUploads} file(s) failed to upload. Use "Add evidence" on the detail screen to retry.`);
      await refreshUnread();
      router.replace({ pathname: '/expense/[id]', params: { id: expenseId! } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.details?.currentVersion) {
        setError('Someone changed this expense while you were editing. Please refresh.');
        return;
      }
      setError(errMsg(e));
    }
  };

  if ((editId && !filled) || (events.loading && !events.data)) return <Screen><Loading /></Screen>;

  const choosable = (events.data?.events ?? []).filter((e: any) => isAdmin || ['UPCOMING', 'ACTIVE'].includes(e.status));
  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? `User ${id}`;
  const sum = (preview?.allocations ?? []).reduce((a, b) => a + b.sharePaise, 0);

  return (
    <Screen>
      {/* Wizard Progress Indicator */}
      <Card style={{ padding: space.md, gap: space.xs }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="h3">{editId ? 'Edit Expense' : 'Add Expense'} — Step {step} of 5</Txt>
          <Badge text={`Step ${step}`} tone="info" />
        </Row>
        <ProgressBar progress={step / 5} />
        <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <Txt variant="small" tone={step === 1 ? 'primary' : 'sub'}>1. Basics</Txt>
          <Txt variant="small" tone={step === 2 ? 'primary' : 'sub'}>2. Payer</Txt>
          <Txt variant="small" tone={step === 3 ? 'primary' : 'sub'}>3. Split</Txt>
          <Txt variant="small" tone={step === 4 ? 'primary' : 'sub'}>4. Evidence</Txt>
          <Txt variant="small" tone={step === 5 ? 'primary' : 'sub'}>5. Review</Txt>
        </Row>
      </Card>

      {error ? <Banner tone="danger" text={error} /> : null}

      {/* STEP 1: BASICS */}
      {step === 1 && (
        <Card style={{ gap: space.md }}>
          <Txt variant="h2">Step 1: Basic Expense Information</Txt>

          {!editId ? (
            <Chips
              label="Select Event"
              value={eventId ? String(eventId) : null}
              onChange={(v) => { setEventId(v ? Number(v) : null); setParts([]); setPayerUserId(null); }}
              options={choosable.map((e: any) => ({ value: String(e.id), label: e.name }))}
            />
          ) : null}

          <Field label="Expense Title / Description" value={f.title} onChangeText={s('title')} placeholder="e.g. Team Dinner at Hotel Munnar" />
          <Field label="Amount in Rupees (₹)" value={f.amount} onChangeText={s('amount')} keyboardType="decimal-pad" placeholder="0.00" prefix="₹" />

          <Txt variant="sub" style={{ fontWeight: '600' }}>Category</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATS.map((c) => {
              const sel = f.category === c.value;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setF((x) => ({ ...x, category: c.value, subcategory: '' }))}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: sel ? t.primary : t.border,
                    backgroundColor: sel ? t.primaryMuted : t.card,
                  }}
                >
                  <Ionicons name={c.icon as any} size={16} color={sel ? t.primary : t.textSub} />
                  <Txt style={{ color: sel ? t.primary : t.text, fontWeight: sel ? '700' : '500', fontSize: 13 }}>{c.label}</Txt>
                </Pressable>
              );
            })}
          </View>

          <Chips label="Payment Method" value={f.method} onChange={s('method')} options={METHODS.map((m) => ({ value: m, label: label(m) }))} />
          <Field label="Date & Time" value={f.spentAt} onChangeText={s('spentAt')} placeholder="2026-12-01 14:30" />
        </Card>
      )}

      {/* STEP 2: PAYER & PEOPLE */}
      {step === 2 && (
        <Card style={{ gap: space.md }}>
          <Txt variant="h2">Step 2: Who Paid & Who Benefited?</Txt>

          {personal ? (
            <Banner tone="info" text="Personal Expense: Paid by you for yourself. Does not create member debt." />
          ) : (
            <>
              <Chips
                label="Who Paid?"
                value={f.payerType}
                onChange={(v) => s('payerType')(v)}
                options={[
                  { value: 'INDIVIDUAL', label: 'Paid by Me' },
                  { value: 'GROUP_MEMBER', label: 'Paid by Another Member' },
                  { value: 'COLLEGE', label: 'Paid by College' },
                  { value: 'ORGANIZATION', label: 'Paid by Organization' },
                  { value: 'OTHER', label: 'Paid by Sponsor' },
                ]}
              />

              {f.payerType === 'GROUP_MEMBER' ? (
                <Chips
                  label="Select Payer"
                  value={payerUserId ? String(payerUserId) : null}
                  onChange={(v) => setPayerUserId(v ? Number(v) : null)}
                  options={members.filter((m) => m.id !== me?.id || isAdmin).map((m) => ({ value: String(m.id), label: m.name }))}
                />
              ) : null}

              {['COLLEGE', 'ORGANIZATION', 'OTHER'].includes(f.payerType) ? (
                <Field label="Sponsor Name" value={f.payerName} onChangeText={s('payerName')} placeholder="e.g. College IT Department" />
              ) : null}

              <SectionTitle action={
                <Row style={{ gap: space.xs }}>
                  <Btn small variant="ghost" title="Select All" onPress={() => setParts(members.map((m) => m.id))} />
                  <Btn small variant="ghost" title="Only Me" onPress={() => setParts(me ? [me.id] : [])} />
                </Row>
              }>
                Participants Sharing Cost ({parts.length})
              </SectionTitle>

              {members.map((m) => {
                const checked = parts.includes(m.id);
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setParts((prev) => checked ? prev.filter((id) => id !== m.id) : [...prev, m.id])}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: space.md,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: checked ? t.primary : t.border,
                      backgroundColor: checked ? t.primaryMuted : t.card,
                    }}
                  >
                    <Row style={{ gap: space.md }}>
                      <Avatar name={m.name} size={32} />
                      <Txt style={{ fontWeight: '600' }}>{m.name}</Txt>
                    </Row>
                    <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? t.primary : t.textSub} />
                  </Pressable>
                );
              })}
            </>
          )}
        </Card>
      )}

      {/* STEP 3: SPLIT METHOD & PREVIEW */}
      {step === 3 && (
        <Card style={{ gap: space.md }}>
          <Txt variant="h2">Step 3: Split Calculation Method</Txt>

          <Chips label="Split Method" value={f.splitMethod} onChange={s('splitMethod')} options={SPLITS} />

          {f.splitMethod !== 'EQUAL' ? (
            <View style={{ gap: space.sm }}>
              <Txt variant="sub" style={{ fontWeight: '600' }}>Enter Values per Participant</Txt>
              {parts.map((uid) => (
                <Field
                  key={uid}
                  label={`${nameOf(uid)} (${f.splitMethod === 'PERCENTAGE' ? '%' : f.splitMethod === 'SHARES' ? 'shares' : '₹'})`}
                  value={vals[uid] ?? ''}
                  onChangeText={(v) => setVals((prev) => ({ ...prev, [uid]: v }))}
                  keyboardType="decimal-pad"
                  prefix={f.splitMethod === 'CUSTOM' || f.splitMethod === 'EXACT' ? '₹' : undefined}
                />
              ))}
            </View>
          ) : null}

          {preview?.error ? <Banner tone="warn" text={preview.error} /> : null}

          {preview?.allocations ? (
            <Card style={{ backgroundColor: t.surfaceAlt, marginTop: space.xs }}>
              <Txt variant="h3">Live Split Calculation Preview</Txt>
              {preview.allocations.map((a) => (
                <KV key={a.userId} k={nameOf(a.userId)} v={formatINR(a.sharePaise)} />
              ))}
              <Row style={{ justifyContent: 'space-between', marginTop: space.xs, paddingTop: space.xs, borderTopWidth: 1, borderColor: t.border }}>
                <Txt style={{ fontWeight: '800' }}>Total Sum</Txt>
                <Money paise={sum} big />
              </Row>
            </Card>
          ) : null}
        </Card>
      )}

      {/* STEP 4: EVIDENCE & VISIBILITY */}
      {step === 4 && (
        <Card style={{ gap: space.md }}>
          <Txt variant="h2">Step 4: Evidence Upload & Visibility</Txt>

          <Chips
            label="Expense Visibility"
            value={f.visibility}
            onChange={s('visibility')}
            options={[
              { value: 'PUBLIC', label: 'Public (Visible to event members)' },
              { value: 'PRIVATE', label: 'Private (Visible only to you & admin)' },
            ]}
          />

          {f.visibility === 'PRIVATE' ? (
            <Field label="Reason for Private Expense" value={f.privateReason} onChangeText={s('privateReason')} placeholder="e.g. Confidential medical expense" />
          ) : null}

          <SectionTitle>Attach Receipt / Evidence Photo</SectionTitle>
          <Row style={{ flexWrap: 'wrap', gap: space.sm }}>
            {files.map((asset, idx) => (
              <Image key={idx} source={{ uri: asset.uri }} style={{ width: 72, height: 72, borderRadius: radius.md }} />
            ))}
          </Row>
          <Btn small variant="secondary" icon="camera-outline" title={files.length ? 'Add Another Photo' : 'Attach Receipt Image'} onPress={pick} />

          <Field label="Additional Notes (Optional)" value={f.notes} onChangeText={s('notes')} multiline placeholder="Any extra notes or receipt numbers..." />
        </Card>
      )}

      {/* STEP 5: REVIEW & SUBMIT */}
      {step === 5 && (
        <Card style={{ gap: space.md }}>
          <Txt variant="h2">Step 5: Review & Confirm</Txt>

          <Card tone="info">
            <Txt variant="h3">{f.title}</Txt>
            {amountPaise ? <Money paise={amountPaise} big signed /> : null}
            <KV k="Event ID" v={String(eventId ?? '')} />
            <KV k="Category" v={label(f.category)} />
            <KV k="Payment Method" v={f.method} />
            <KV k="Spent Date" v={f.spentAt} />
            <KV k="Payer Type" v={f.payerType} />
            <KV k="Split Method" v={f.splitMethod} />
            <KV k="Visibility" v={f.visibility} />
            <KV k="Receipt Attachments" v={`${files.length} photo(s)`} />
          </Card>

          {preview?.allocations ? (
            <Card>
              <Txt variant="h3">Final Allocations Summary</Txt>
              {preview.allocations.map((a) => (
                <KV key={a.userId} k={nameOf(a.userId)} v={formatINR(a.sharePaise)} />
              ))}
            </Card>
          ) : null}
        </Card>
      )}

      {/* Sticky Bottom Navigation Bar */}
      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        {step > 1 ? (
          <Btn title="Back" variant="secondary" onPress={prevStep} />
        ) : <View />}

        {step < 5 ? (
          <Btn title="Next Step" variant="primary" gradient onPress={nextStep} />
        ) : (
          <Btn title={editId ? 'Save & Resubmit' : 'Submit Expense'} variant="primary" gradient onPress={submit} />
        )}
      </Row>
    </Screen>
  );
}
