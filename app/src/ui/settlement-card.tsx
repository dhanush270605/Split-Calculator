import React from 'react';
import { post } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { Badge, Btn, Card, Money, Row, Txt, confirm, notice, shortDateTime } from '@/ui/components';
import { formatINR } from '@/lib/money';

export function SettlementCard({ s, meId, isAdmin, onChanged }: { s: any; meId: number; isAdmin: boolean; onChanged: () => void }) {
  const act = async (path: string, body: any = {}) => { try { await post(`/settlements/${s.id}/${path}`, body); onChanged(); } catch (e) { notice('Could not update', errMsg(e)); } };
  const mine = s.toUserId === meId, payer = s.fromUserId === meId;
  return (
    <Card tone={s.status === 'PAID' && mine ? 'action' : s.status === 'DISPUTED' ? 'danger' : undefined}>
      <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{s.fromName} → {s.toName}</Txt><Money paise={s.amountPaise} /></Row>
      <Row><Badge text={s.status} />{s.method ? <Badge text={s.method} tone="neutral" /> : null}</Row>
      <Txt variant="small">{s.eventName} · {shortDateTime(s.paidAt ?? s.createdAt)}{s.note ? ` · ${s.note}` : ''}</Txt>
      {s.adminNote ? <Txt variant="small">Admin note: {s.adminNote}</Txt> : null}
      <Row style={{ flexWrap: 'wrap' }}>
        {(mine || isAdmin) && ['PAID', 'PAYMENT_INITIATED', 'DISPUTED'].includes(s.status) ? <Btn small title="Confirm received" onPress={async () => { if (await confirm('Confirm payment', `Confirm you received ${formatINR(s.amountPaise)} from ${s.fromName}?`)) await act('confirm'); }} /> : null}
        {mine && ['PAID', 'PAYMENT_INITIATED'].includes(s.status) ? <Btn small variant="danger" title="Not received" onPress={() => act('dispute', { note: 'Payment not received' })} /> : null}
        {payer && s.status === 'PENDING' ? <Btn small title="I paid" onPress={() => act('pay', { method: 'UPI' })} /> : null}
        {(s.createdBy === meId || isAdmin) && !['CONFIRMED', 'CANCELLED'].includes(s.status) ? <Btn small variant="ghost" title="Cancel" onPress={async () => { if (await confirm('Cancel payment record?', 'This marks the payment record as cancelled.')) await act('cancel'); }} /> : null}
      </Row>
    </Card>
  );
}


