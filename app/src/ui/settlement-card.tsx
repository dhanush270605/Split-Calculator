import React, { useState } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { post, uploadAttachment } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { Avatar, Badge, Btn, Card, Field, Money, Row, Txt, confirm, notice, shortDateTime } from '@/ui/components';
import { formatINR } from '@/lib/money';
import { label, useTheme } from '@/ui/theme';

export function SettlementCard({ s, meId, isAdmin, onChanged }: { s: any; meId: number; isAdmin: boolean; onChanged: () => void }) {
  const t = useTheme();
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
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

  const mine = s.toUserId === meId;
  const payer = s.fromUserId === meId;

  return (
    <Card tone={s.status === 'PAID' && mine ? 'action' : s.status === 'DISPUTED' ? 'danger' : undefined}>
      {/* Header with Avatars and Amount */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Row style={{ flex: 1, gap: 8, alignItems: 'center' }}>
          <Avatar name={s.fromName} userId={s.fromUserId} size={34} />
          <Txt variant="caption" tone="muted">→</Txt>
          <Avatar name={s.toName} userId={s.toUserId} size={34} />
          <View style={{ flex: 1, marginLeft: 4 }}>
            <Txt style={{ fontWeight: '700' }}>{s.fromName} → {s.toName}</Txt>
            <Txt variant="caption" tone="muted">{s.eventName}</Txt>
          </View>
        </Row>
        <Money paise={s.amountPaise} />
      </Row>

      {/* Badges and Metadata */}
      <Row style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <Badge text={s.status} tone={s.status === 'CONFIRMED' ? 'success' : s.status === 'PAID' ? 'action' : s.status === 'DISPUTED' ? 'danger' : 'warn'} />
        {s.method ? <Badge text={s.method} tone="neutral" /> : null}
        <Txt variant="caption" tone="muted" style={{ marginLeft: 'auto' }}>{shortDateTime(s.paidAt ?? s.createdAt)}</Txt>
      </Row>

      {s.note ? <Txt variant="sub" style={{ marginBottom: 4 }}>Note: {s.note}</Txt> : null}
      {s.adminNote ? <Txt variant="caption" tone="action" style={{ marginBottom: 4 }}>Admin note: {s.adminNote}</Txt> : null}

      {/* Attachments indicator */}
      {s.attachments?.length > 0 ? (
        <Txt variant="caption" tone="muted" style={{ marginBottom: 8 }}>📎 {s.attachments.length} evidence attachment(s)</Txt>
      ) : null}

      {/* Actions */}
      <Row style={{ flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        {(mine || isAdmin) && ['PAID', 'PAYMENT_INITIATED', 'DISPUTED'].includes(s.status) ? (
          <Btn small title="Confirm received" icon="checkmark-done-outline" disabled={busy} onPress={async () => {
            if (await confirm('Confirm payment', `Confirm you received ${formatINR(s.amountPaise)} from ${s.fromName}?`)) await act('confirm');
          }} />
        ) : null}
        
        {mine && ['PAID', 'PAYMENT_INITIATED'].includes(s.status) ? (
          <Btn small variant="danger" title="Not received" icon="alert-circle-outline" disabled={busy} onPress={() => act('dispute', { note: 'Payment not received by recipient' })} />
        ) : null}

        {payer && s.status === 'PENDING' ? (
          <Btn small title="I paid this" icon="paper-plane-outline" disabled={busy} onPress={() => act('pay', { method: 'UPI' })} />
        ) : null}

        {(payer || mine || isAdmin) && !['CONFIRMED', 'CANCELLED'].includes(s.status) ? (
          <Btn small variant="secondary" icon="attach-outline" title="Add receipt" disabled={busy} onPress={addEvidence} />
        ) : null}

        {isAdmin && !['CONFIRMED', 'CANCELLED'].includes(s.status) ? (
          <Btn small variant="secondary" icon="shield-checkmark-outline" title="Admin override" disabled={busy} onPress={() => setShowOverride((x) => !x)} />
        ) : null}

        {(s.createdBy === meId || isAdmin) && !['CONFIRMED', 'CANCELLED'].includes(s.status) ? (
          <Btn small variant="ghost" title="Cancel" disabled={busy} onPress={async () => {
            if (await confirm('Cancel payment record?', 'This marks the payment record as cancelled.')) await act('cancel');
          }} />
        ) : null}
      </Row>

      {/* Admin Override Inputs */}
      {showOverride ? (
        <View style={{ marginTop: 10, padding: 10, backgroundColor: t.surfaceAlt, borderRadius: 10, gap: 8 }}>
          <Txt variant="h3">Admin Settlement Override</Txt>
          <Field label="Reason for overriding balance" value={overrideReason} onChangeText={setOverrideReason} placeholder="e.g. Verified bank transfer proof manually" />
          <Row style={{ gap: 8 }}>
            <Btn small title="Confirm Override" disabled={busy} onPress={submitOverride} />
            <Btn small variant="ghost" title="Cancel" onPress={() => setShowOverride(false)} />
          </Row>
        </View>
      ) : null}
    </Card>
  );
}



