import React, { useState } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { post, uploadAttachment } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { Avatar, Badge, Btn, Card, Chips, Field, Money, ModalDialog, Row, Txt, confirm, notice, shortDateTime } from '@/ui/components';
import { formatINR } from '@/lib/money';
import { label, useTheme } from '@/ui/theme';

const METHODS = ['UPI', 'CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'];

export function SettlementCard({ s, meId, isAdmin, onChanged }: { s: any; meId: number; isAdmin: boolean; onChanged: () => void }) {
  const t = useTheme();
  const [showOverride, setShowOverride] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [payMethod, setPayMethod] = useState<string>(s.method ?? 'UPI');
  const [payNote, setPayNote] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (path: string, body: any = {}) => {
    try {
      setBusy(true);
      await post(`/settlements/${s.id}/${path}`, body);
      onChanged();
    } catch (e) {
      notice('Could not update', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const addEvidence = async () => {
    const p = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (p.canceled) return;
    const a = p.assets[0];
    try {
      setBusy(true);
      await uploadAttachment('SETTLEMENT', s.id, { uri: a.uri, name: a.fileName ?? 'payment_receipt.jpg', mimeType: a.mimeType ?? 'image/jpeg', file: (a as any).file }, 'RECEIPT');
      notice('Uploaded', 'Payment receipt uploaded successfully.');
      onChanged();
    } catch (e) {
      notice('Could not upload evidence', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const submitOverride = async () => {
    if (!overrideReason.trim()) return notice('Required', 'Please enter a reason for the admin override');
    try {
      setBusy(true);
      await post(`/settlements/${s.id}/admin-override`, { reason: overrideReason.trim(), newStatus: 'CONFIRMED' });
      setShowOverride(false);
      setOverrideReason('');
      notice('Admin override', 'Settlement marked as confirmed by admin.');
      onChanged();
    } catch (e) {
      notice('Could not override', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const submitPay = async () => {
    try {
      setBusy(true);
      await post(`/settlements/${s.id}/pay`, { method: payMethod, note: payNote.trim() || undefined });
      setShowPay(false);
      onChanged();
    } catch (e) {
      notice('Could not mark payment', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const mine = s.toUserId === meId;
  const payer = s.fromUserId === meId;

  return (
    <Card tone={s.status === 'PAID' && mine ? 'action' : s.status === 'DISPUTED' ? 'danger' : undefined}>
      {/* Header — Avatars + Amount */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Row style={{ flex: 1, gap: 10, alignItems: 'center' }}>
          <Avatar name={s.fromName ?? '?'} size={34} />
          <Txt variant="caption" tone="muted">→</Txt>
          <Avatar name={s.toName ?? '?'} size={34} />
          <View style={{ flex: 1, marginLeft: 4 }}>
            <Txt style={{ fontWeight: '700' }} numberOfLines={1}>{s.fromName ?? '—'} → {s.toName ?? '—'}</Txt>
            <Txt variant="small" tone="muted">{s.eventName}</Txt>
          </View>
        </Row>
        <Money paise={s.amountPaise} />
      </Row>

      {/* Badges + Metadata */}
      <Row style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Badge
          text={s.status}
          tone={s.status === 'CONFIRMED' ? 'success' : s.status === 'PAID' ? 'action' : s.status === 'DISPUTED' ? 'danger' : 'warn'}
        />
        {s.method ? <Badge text={s.method} tone="neutral" /> : null}
        <Txt variant="small" tone="muted" style={{ marginLeft: 'auto' }}>{shortDateTime(s.paidAt ?? s.createdAt)}</Txt>
      </Row>

      {s.note ? <Txt variant="sub" tone="sub">Note: {s.note}</Txt> : null}
      {s.adminNote ? <Txt variant="small" tone="action">Admin note: {s.adminNote}</Txt> : null}
      {s.attachments?.length > 0 ? (
        <Txt variant="small" tone="muted">📎 {s.attachments.length} evidence attachment(s)</Txt>
      ) : null}

      {/* Action Buttons */}
      <Row style={{ flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        {/* Confirm received (recipient or admin) */}
        {(mine || isAdmin) && ['PAID', 'PAYMENT_INITIATED', 'DISPUTED'].includes(s.status) ? (
          <Btn small title="Confirm received" icon="checkmark-done-outline" disabled={busy} onPress={async () => {
            if (await confirm('Confirm payment', `Confirm you received ${formatINR(s.amountPaise)} from ${s.fromName}?`)) await act('confirm');
          }} />
        ) : null}

        {/* Mark as paid (payer) */}
        {payer && s.status === 'PENDING' ? (
          <Btn small title="I paid this" icon="paper-plane-outline" disabled={busy} onPress={() => setShowPay(true)} />
        ) : null}

        {/* Dispute (recipient) */}
        {mine && ['PAID', 'PAYMENT_INITIATED'].includes(s.status) ? (
          <Btn small variant="danger" title="Not received" icon="alert-circle-outline" disabled={busy}
            onPress={() => act('dispute', { note: 'Payment not received by recipient' })} />
        ) : null}

        {/* Add receipt */}
        {(payer || mine || isAdmin) && !['CONFIRMED', 'CANCELLED'].includes(s.status) ? (
          <Btn small variant="secondary" icon="attach-outline" title="Add receipt" disabled={busy} onPress={addEvidence} />
        ) : null}

        {/* Admin override */}
        {isAdmin && !['CONFIRMED', 'CANCELLED'].includes(s.status) ? (
          <Btn small variant="secondary" icon="shield-checkmark-outline" title="Admin override" disabled={busy}
            onPress={() => setShowOverride((x) => !x)} />
        ) : null}

        {/* Cancel */}
        {(s.createdBy === meId || isAdmin) && !['CONFIRMED', 'CANCELLED'].includes(s.status) ? (
          <Btn small variant="ghost" title="Cancel" disabled={busy} onPress={async () => {
            if (await confirm('Cancel payment record?', 'This marks the payment record as cancelled.')) await act('cancel');
          }} />
        ) : null}
      </Row>

      {/* Pay Modal — choose method */}
      <ModalDialog visible={showPay} onClose={() => setShowPay(false)} title="Mark as Paid">
        <Txt variant="sub" tone="sub">How did you pay {s.toName}?</Txt>
        <Chips
          label="Payment Method"
          value={payMethod}
          onChange={(v) => setPayMethod(v)}
          options={METHODS.map((m) => ({ value: m, label: label(m) }))}
        />
        <Field label="Optional note (UPI ref, UTR, etc.)" value={payNote} onChangeText={setPayNote} placeholder="e.g. UPI Ref: 123456789" />
        <Row style={{ gap: 8 }}>
          <Btn title="Confirm Payment" icon="paper-plane-outline" gradient onPress={submitPay} loading={busy} />
          <Btn variant="ghost" title="Cancel" onPress={() => setShowPay(false)} />
        </Row>
      </ModalDialog>

      {/* Admin Override Panel */}
      {showOverride ? (
        <View style={{ marginTop: 10, padding: 12, backgroundColor: t.surfaceAlt, borderRadius: 10, gap: 8 }}>
          <Txt variant="h3">Admin Settlement Override</Txt>
          <Field
            label="Reason for overriding"
            value={overrideReason}
            onChangeText={setOverrideReason}
            placeholder="e.g. Verified bank transfer proof manually"
          />
          <Row style={{ gap: 8 }}>
            <Btn small title="Confirm Override" disabled={busy} onPress={submitOverride} />
            <Btn small variant="ghost" title="Cancel" onPress={() => setShowOverride(false)} />
          </Row>
        </View>
      ) : null}
    </Card>
  );
}
