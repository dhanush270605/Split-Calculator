import React, { useState } from 'react';
import { View } from 'react-native';
import { get } from '@/lib/api';
import { useDebounced, useLoad } from '@/lib/hooks';
import { Badge, Btn, Card, Chips, Empty, ErrorBox, Field, KV, Row, Screen, Skeleton, Txt, shortDateTime } from '@/ui/components';
import { label, useTheme } from '@/ui/theme';

const ACTIONS = ['', 'LOGIN', 'LOGIN_FAILED', 'USER_CREATED', 'EVENT_CREATED', 'EVENT_UPDATED', 'EXPENSE_CREATED', 'EXPENSE_UPDATED', 'EXPENSE_APPROVED', 'EXPENSE_DECLINED', 'EXPENSE_DISPUTED', 'SETTLEMENT_CREATED', 'SETTLEMENT_CONFIRMED', 'ADMIN_OVERRIDE'];

export default function Audit() {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [limit, setLimit] = useState(40);
  
  const q = useDebounced(search);
  const r = useLoad(() => get(`/admin/audit?limit=${limit}${action ? `&action=${action}` : ''}${q ? `&search=${encodeURIComponent(q)}` : ''}`), [q, action, limit]);

  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">System Audit Log</Txt>
      </Row>

      <Field label="Search audit entries" value={search} onChangeText={setSearch} placeholder="Search by actor name, action, or metadata..." />
      <Chips value={action} onChange={setAction} options={ACTIONS.map((a) => ({ value: a, label: a ? label(a) : 'All actions' }))} />

      {r.loading && !r.data ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : r.error ? (
        <ErrorBox message={r.error} onRetry={r.reload} />
      ) : r.data.logs.length === 0 ? (
        <Empty icon="document-text-outline" title="No audit entries found" hint="Try adjusting search terms or action filters." />
      ) : (
        <>
          <Txt variant="caption" tone="muted" style={{ marginBottom: 4 }}>Showing {r.data.logs.length} of {r.data.total} immutable audit entries</Txt>
          {r.data.logs.map((a: any) => (
            <Card key={a.id} onPress={() => setOpen(open === a.id ? null : a.id)}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <Row style={{ flex: 1, gap: 8, alignItems: 'center', marginRight: 8 }}>
                  <Badge text={a.action} tone={a.action.includes('FAILED') || a.action.includes('DISPUTED') ? 'danger' : a.action.includes('OVERRIDE') ? 'warn' : 'neutral'} />
                  <Txt variant="h3" style={{ flex: 1 }}>{label(a.action)}</Txt>
                </Row>
                <Txt variant="caption" tone="muted">#{a.id}</Txt>
              </Row>

              <Txt variant="sub" tone="muted">{a.actorName ?? 'System / Anonymous'} · {a.entityType ?? ''} {a.entityId ? `#${a.entityId}` : ''} · {shortDateTime(a.createdAt)}</Txt>

              {open === a.id ? (
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.border, gap: 6 }}>
                  {a.metadata ? <Txt variant="caption" selectable style={{ fontFamily: 'monospace' }}>Meta: {a.metadata}</Txt> : null}
                  {a.previousState ? <Txt variant="caption" selectable style={{ fontFamily: 'monospace' }}>Previous State: {a.previousState.slice(0, 600)}</Txt> : null}
                  {a.newState ? <Txt variant="caption" selectable style={{ fontFamily: 'monospace' }}>New State: {a.newState.slice(0, 600)}</Txt> : null}
                </View>
              ) : null}
            </Card>
          ))}
          {r.data.logs.length < r.data.total ? (
            <Btn variant="secondary" title="Load more audit logs" onPress={() => setLimit((l) => l + 40)} style={{ marginTop: 8 }} />
          ) : null}
        </>
      )}
    </Screen>
  );
}
