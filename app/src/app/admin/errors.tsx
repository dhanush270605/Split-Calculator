import React, { useState } from 'react';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { Badge, Btn, Card, Chips, Empty, ErrorBox, KV, Loading, Row, Screen, SectionTitle, Txt, shortDateTime } from '@/ui/components';

export default function Errors() {
  const [resolved, setResolved] = useState('false');
  const [open, setOpen] = useState<number | null>(null);
  const h = useLoad(() => get('/admin/health'));
  const r = useLoad(() => get(`/admin/errors?resolved=${resolved}`), [resolved]);
  return (
    <Screen onRefresh={() => { h.refresh(); r.refresh(); }} refreshing={r.refreshing}>
      {h.data ? (
        <Card tone={h.data.status === 'HEALTHY' ? 'success' : 'danger'}>
          <Row style={{ justifyContent: 'space-between' }}><Txt variant="h2">System {h.data.status.toLowerCase()}</Txt><Badge text={h.data.status === 'HEALTHY' ? 'ACTIVE' : 'DISPUTED'} /></Row>
          <KV k="Database integrity" v={h.data.database.integrity} /><KV k="Foreign-key violations" v={String(h.data.database.foreignKeyViolations)} /><KV k="Uptime" v={`${Math.round(h.data.uptimeSeconds / 60)} min`} /><KV k="Node" v={h.data.node} />
          <KV k="Users / events / expenses" v={`${h.data.counts.users} / ${h.data.counts.events} / ${h.data.counts.expenses}`} /><KV k="Audit rows" v={String(h.data.counts.auditLogs)} />
        </Card>
      ) : null}
      {r.data?.bySource?.length ? <Row style={{ flexWrap: 'wrap' }}>{r.data.bySource.map((s: any) => <Badge key={s.source} text={`${s.source}: ${s.count}`} tone="warn" />)}</Row> : null}
      <Chips value={resolved} onChange={setResolved} options={[{ value: 'false', label: 'Unresolved' }, { value: 'true', label: 'Resolved' }]} />
      <SectionTitle>Errors & warnings</SectionTitle>
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorBox message={r.error} onRetry={r.reload} /> : r.data.errors.length === 0 ? <Empty icon="checkmark-circle-outline" title="No errors here" /> : r.data.errors.map((e: any) => (
        <Card key={e.id} tone={e.level === 'ERROR' ? 'danger' : 'warn'} onPress={() => setOpen(open === e.id ? null : e.id)}>
          <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{e.message}</Txt><Badge text={e.source} tone="neutral" /></Row>
          <Txt variant="small">{shortDateTime(e.createdAt)}{e.userId ? ` · user ${e.userId}` : ''}</Txt>
          {open === e.id ? (<>{e.context ? <Txt variant="small" selectable>{e.context}</Txt> : null}{e.stack ? <Txt variant="small" selectable>{e.stack.slice(0, 700)}</Txt> : null}
            {!e.resolved ? <Btn small variant="secondary" title="Mark resolved" onPress={async () => { await post(`/admin/errors/${e.id}/resolve`); r.reload(true); }} /> : null}</>) : null}
        </Card>
      ))}
    </Screen>
  );
}
