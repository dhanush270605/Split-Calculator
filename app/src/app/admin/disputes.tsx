import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { get, post } from '@/lib/api';
import { errMsg, useLoad } from '@/lib/hooks';
import { formatINR } from '@/lib/money';
import { Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Loading, Row, Screen, Txt, notice, shortDateTime } from '@/ui/components';
import { label } from '@/ui/theme';

export default function Disputes() {
  const router = useRouter();
  const [status, setStatus] = useState('OPEN');
  const [note, setNote] = useState<Record<number, string>>({});
  const r = useLoad(() => get(`/disputes${status ? `?status=${status}` : ''}`), [status]);
  const resolve = async (id: number, s: string) => { try { await post(`/disputes/${id}/resolve`, { status: s, note: note[id] || undefined }); r.reload(true); } catch (e) { notice('Could not update', errMsg(e)); } };
  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, ...['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'CORRECTED'].map((s) => ({ value: s, label: label(s) }))]} />
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorBox message={r.error} onRetry={r.reload} /> : r.data.disputes.length === 0 ? <Empty icon="shield-checkmark-outline" title="No disputes" /> : r.data.disputes.map((d: any) => (
        <Card key={d.id} tone={['OPEN', 'UNDER_REVIEW'].includes(d.status) ? 'danger' : undefined}>
          <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{d.expenseTitle} · {formatINR(d.amountPaise)}</Txt><Badge text={d.status} /></Row>
          <Txt variant="sub">{d.raisedByName} · {shortDateTime(d.createdAt)}</Txt>
          <Txt style={{ fontWeight: '700' }}>{d.reason}</Txt>{d.message ? <Txt>{d.message}</Txt> : null}
          {d.resolutionNote ? <Txt variant="sub">Resolution: {d.resolutionNote}</Txt> : null}
          <Btn small variant="ghost" title="Open expense" onPress={() => router.push({ pathname: '/expense/[id]', params: { id: d.expenseId } })} />
          {['OPEN', 'UNDER_REVIEW'].includes(d.status) ? (
            <>
              <Field label="Resolution note" value={note[d.id] ?? ''} onChangeText={(v) => setNote((n) => ({ ...n, [d.id]: v }))} />
              <Row style={{ flexWrap: 'wrap' }}>
                <Btn small variant="secondary" title="Review" onPress={() => resolve(d.id, 'UNDER_REVIEW')} />
                <Btn small title="Resolve" onPress={() => resolve(d.id, 'RESOLVED')} />
                <Btn small variant="secondary" title="Corrected" onPress={() => resolve(d.id, 'CORRECTED')} />
                <Btn small variant="danger" title="Reject" onPress={() => resolve(d.id, 'REJECTED')} />
              </Row>
            </>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
