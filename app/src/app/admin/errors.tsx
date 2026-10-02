import React, { useState } from 'react';
import { View } from 'react-native';
import { get, post } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { Badge, Btn, Card, Chips, Empty, ErrorBox, KV, Row, Screen, SectionTitle, Skeleton, Txt, shortDateTime } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export default function Errors() {
  const t = useTheme();
  const [resolved, setResolved] = useState('false');
  const [open, setOpen] = useState<number | null>(null);

  const h = useLoad(() => get('/admin/health'));
  const r = useLoad(() => get(`/admin/errors?resolved=${resolved}`), [resolved]);

  return (
    <Screen onRefresh={() => { h.refresh(); r.refresh(); }} refreshing={r.refreshing}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">System Health & Errors</Txt>
      </Row>

      {/* System Health Overview Card */}
      {h.data ? (
        <Card tone={h.data.status === 'HEALTHY' ? 'success' : 'danger'}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Txt variant="h2">System {h.data.status.toLowerCase()}</Txt>
            <Badge text={h.data.status} tone={h.data.status === 'HEALTHY' ? 'success' : 'danger'} />
          </Row>
          
          <View style={{ gap: 6 }}>
            <KV k="Database integrity" v={h.data.database.integrity} />
            <KV k="Foreign-key violations" v={String(h.data.database.foreignKeyViolations)} />
            <KV k="Uptime" v={`${Math.round(h.data.uptimeSeconds / 60)} minutes`} />
            <KV k="Node runtime" v={h.data.node} />
            <KV k="Users / Events / Expenses" v={`${h.data.counts.users} / ${h.data.counts.events} / ${h.data.counts.expenses}`} />
            <KV k="Audit log rows" v={String(h.data.counts.auditLogs)} />
          </View>
        </Card>
      ) : null}

      {/* Errors By Source Summary Chips */}
      {r.data?.bySource?.length ? (
        <Row style={{ flexWrap: 'wrap', gap: 6, marginVertical: 4 }}>
          {r.data.bySource.map((s: any) => (
            <Badge key={s.source} text={`${s.source}: ${s.count}`} tone="warn" />
          ))}
        </Row>
      ) : null}

      <Chips value={resolved} onChange={setResolved} options={[{ value: 'false', label: 'Unresolved Errors' }, { value: 'true', label: 'Resolved History' }]} />

      <SectionTitle>Error Logs & Diagnostics</SectionTitle>
      {r.loading && !r.data ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : r.error ? (
        <ErrorBox message={r.error} onRetry={r.reload} />
      ) : r.data.errors.length === 0 ? (
        <Empty icon="checkmark-circle-outline" title="No errors reported" hint="System runtime and client crash reports are clean." />
      ) : (
        r.data.errors.map((e: any) => (
          <Card key={e.id} tone={e.level === 'ERROR' ? 'danger' : 'warn'} onPress={() => setOpen(open === e.id ? null : e.id)}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <Txt variant="h3" style={{ flex: 1, marginRight: 8 }}>{e.message}</Txt>
              <Badge text={e.source} tone="neutral" />
            </Row>

            <Txt variant="caption" tone="muted">{shortDateTime(e.createdAt)}{e.userId ? ` · User ID ${e.userId}` : ''}</Txt>

            {open === e.id ? (
              <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.border, gap: 8 }}>
                {e.context ? <Txt variant="caption" selectable style={{ fontFamily: 'monospace' }}>Context: {e.context}</Txt> : null}
                {e.stack ? <Txt variant="caption" selectable style={{ fontFamily: 'monospace' }}>Stack Trace: {e.stack.slice(0, 700)}</Txt> : null}
                {!e.resolved ? (
                  <Btn small variant="secondary" icon="checkmark-outline" title="Mark as resolved" onPress={async () => {
                    await post(`/admin/errors/${e.id}/resolve`);
                    r.reload(true);
                  }} style={{ alignSelf: 'flex-start' }} />
                ) : null}
              </View>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
