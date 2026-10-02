import React, { useState } from 'react';
import { View } from 'react-native';
import { get, patch } from '@/lib/api';
import { errMsg, useLoad } from '@/lib/hooks';
import { Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Row, Screen, Skeleton, Txt, notice, shortDateTime } from '@/ui/components';
import { label, useTheme } from '@/ui/theme';

export default function Problems() {
  const t = useTheme();
  const [status, setStatus] = useState('');
  const [note, setNote] = useState<Record<number, string>>({});

  const r = useLoad(() => get(`/admin/problems${status ? `?status=${status}` : ''}`), [status]);

  const upd = async (id: number, s: string) => {
    try {
      await patch(`/admin/problems/${id}`, { status: s, adminNote: note[id] || undefined });
      notice('Updated', `Report #${id} marked as ${label(s)}.`);
      r.reload(true);
    } catch (e) {
      notice('Could not update report', errMsg(e));
    }
  };

  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">Maintenance & Problem Reports</Txt>
      </Row>

      <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'All Statuses' }, ...['OPEN', 'INVESTIGATING', 'RESOLVED'].map((s) => ({ value: s, label: label(s) }))]} />

      {r.loading && !r.data ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={90} />
          <Skeleton height={90} />
        </View>
      ) : r.error ? (
        <ErrorBox message={r.error} onRetry={r.reload} />
      ) : r.data.problems.length === 0 ? (
        <Empty icon="checkmark-done-circle-outline" title="No maintenance reports" hint="User-submitted bug reports and inquiries will appear here." />
      ) : (
        r.data.problems.map((p: any) => (
          <Card key={p.id} tone={p.status === 'OPEN' ? 'warn' : p.status === 'RESOLVED' ? 'success' : undefined}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <Txt variant="h3" style={{ flex: 1, marginRight: 8 }}>{p.title}</Txt>
              <Badge text={p.status} tone={p.status === 'RESOLVED' ? 'success' : p.status === 'INVESTIGATING' ? 'action' : 'warn'} />
            </Row>

            <Txt variant="caption" tone="muted">{p.userName} · Category: {label(p.category)} · {shortDateTime(p.createdAt)}</Txt>
            <Txt style={{ marginVertical: 6 }}>{p.description}</Txt>
            {p.deviceInfo ? <Txt variant="caption" tone="muted">Device: {p.deviceInfo}</Txt> : null}
            {p.adminNote ? <Txt variant="sub" tone="action" style={{ marginTop: 4 }}>Admin Note: {p.adminNote}</Txt> : null}

            <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.border, gap: 8 }}>
              <Field label="Add / update admin note" value={note[p.id] ?? ''} onChangeText={(v) => setNote((n) => ({ ...n, [p.id]: v }))} placeholder="Note sent to reporting user..." />
              <Row style={{ gap: 8 }}>
                <Btn small variant="secondary" title="Mark Investigating" icon="search-outline" onPress={() => upd(p.id, 'INVESTIGATING')} />
                <Btn small title="Mark Resolved" icon="checkmark-outline" onPress={() => upd(p.id, 'RESOLVED')} />
              </Row>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
