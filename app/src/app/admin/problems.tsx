import React, { useState } from 'react';
import { get, patch } from '@/lib/api';
import { errMsg, useLoad } from '@/lib/hooks';
import { Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Loading, Row, Screen, Txt, notice, shortDateTime } from '@/ui/components';
import { label } from '@/ui/theme';

export default function Problems() {
  const [status, setStatus] = useState('');
  const [note, setNote] = useState<Record<number, string>>({});
  const r = useLoad(() => get(`/admin/problems${status ? `?status=${status}` : ''}`), [status]);
  const upd = async (id: number, s: string) => { try { await patch(`/admin/problems/${id}`, { status: s, adminNote: note[id] || undefined }); r.reload(true); } catch (e) { notice('Could not update', errMsg(e)); } };
  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, ...['OPEN', 'INVESTIGATING', 'RESOLVED'].map((s) => ({ value: s, label: label(s) }))]} />
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorBox message={r.error} onRetry={r.reload} /> : r.data.problems.length === 0 ? <Empty title="No reports" /> : r.data.problems.map((p: any) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{p.title}</Txt><Badge text={p.status} /></Row>
          <Txt variant="sub">{p.userName} · {label(p.category)} · {shortDateTime(p.createdAt)}</Txt>
          <Txt>{p.description}</Txt>
          {p.deviceInfo ? <Txt variant="small">Device: {p.deviceInfo}</Txt> : null}
          {p.adminNote ? <Txt variant="sub">Note: {p.adminNote}</Txt> : null}
          <Field label="Admin note" value={note[p.id] ?? ''} onChangeText={(v) => setNote((n) => ({ ...n, [p.id]: v }))} />
          <Row style={{ flexWrap: 'wrap' }}>
            <Btn small variant="secondary" title="Investigating" onPress={() => upd(p.id, 'INVESTIGATING')} />
            <Btn small title="Resolved" onPress={() => upd(p.id, 'RESOLVED')} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
