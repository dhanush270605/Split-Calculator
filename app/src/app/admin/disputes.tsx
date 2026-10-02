import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { get, post } from '@/lib/api';
import { errMsg, useLoad } from '@/lib/hooks';
import { formatINR } from '@/lib/money';
import { Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Money, Row, Screen, Skeleton, Txt, notice, shortDateTime } from '@/ui/components';
import { label, useTheme } from '@/ui/theme';

export default function Disputes() {
  const router = useRouter();
  const t = useTheme();
  const [status, setStatus] = useState('OPEN');
  const [note, setNote] = useState<Record<number, string>>({});

  const r = useLoad(() => get(`/disputes${status ? `?status=${status}` : ''}`), [status]);

  const resolve = async (id: number, s: string) => {
    try {
      await post(`/disputes/${id}/resolve`, { status: s, note: note[id] || undefined });
      notice('Updated', `Dispute #${id} updated to ${label(s)}.`);
      r.reload(true);
    } catch (e) {
      notice('Could not update dispute', errMsg(e));
    }
  };

  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">Dispute Resolution Queue</Txt>
      </Row>

      <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'All Disputes' }, ...['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'CORRECTED'].map((s) => ({ value: s, label: label(s) }))]} />

      {r.loading && !r.data ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={100} />
          <Skeleton height={100} />
        </View>
      ) : r.error ? (
        <ErrorBox message={r.error} onRetry={r.reload} />
      ) : r.data.disputes.length === 0 ? (
        <Empty icon="shield-checkmark-outline" title="No active disputes" hint="All expense and settlement disputes have been handled." />
      ) : (
        r.data.disputes.map((d: any) => (
          <Card key={d.id} tone={['OPEN', 'UNDER_REVIEW'].includes(d.status) ? 'danger' : undefined}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Txt variant="h3">{d.expenseTitle}</Txt>
                <Txt variant="caption" tone="muted">Raised by {d.raisedByName} · {shortDateTime(d.createdAt)}</Txt>
              </View>
              <Money paise={d.amountPaise} />
            </Row>

            <Row style={{ gap: 6, marginVertical: 6 }}>
              <Badge text={d.status} tone={['OPEN', 'UNDER_REVIEW'].includes(d.status) ? 'danger' : 'success'} />
            </Row>

            <Txt style={{ fontWeight: '700', marginBottom: 2 }}>Reason: {d.reason}</Txt>
            {d.message ? <Txt variant="sub">{d.message}</Txt> : null}
            {d.resolutionNote ? <Txt variant="sub" tone="action" style={{ marginTop: 4 }}>Resolution Note: {d.resolutionNote}</Txt> : null}

            <Btn small variant="secondary" icon="open-outline" title="View linked expense" onPress={() => router.push({ pathname: '/expense/[id]', params: { id: d.expenseId } })} style={{ marginTop: 8, alignSelf: 'flex-start' }} />

            {['OPEN', 'UNDER_REVIEW'].includes(d.status) ? (
              <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.border, gap: 8 }}>
                <Field label="Resolution summary note" value={note[d.id] ?? ''} onChangeText={(v) => setNote((n) => ({ ...n, [d.id]: v }))} placeholder="Reasoning for decision..." />
                <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                  <Btn small variant="secondary" title="Under Review" onPress={() => resolve(d.id, 'UNDER_REVIEW')} />
                  <Btn small title="Resolve" icon="checkmark-outline" onPress={() => resolve(d.id, 'RESOLVED')} />
                  <Btn small variant="secondary" title="Corrected" onPress={() => resolve(d.id, 'CORRECTED')} />
                  <Btn small variant="danger" title="Reject" icon="close-outline" onPress={() => resolve(d.id, 'REJECTED')} />
                </Row>
              </View>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
