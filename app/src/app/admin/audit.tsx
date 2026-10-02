import React, { useState } from 'react';
import { get } from '@/lib/api';
import { useDebounced, useLoad } from '@/lib/hooks';
import { Btn, Card, Chips, Empty, ErrorBox, Field, Loading, Row, Screen, Txt, shortDateTime } from '@/ui/components';
import { label } from '@/ui/theme';

const ACTIONS = ['', 'LOGIN', 'LOGIN_FAILED', 'USER_CREATED', 'EVENT_CREATED', 'EVENT_UPDATED', 'EXPENSE_CREATED', 'EXPENSE_UPDATED', 'EXPENSE_APPROVED', 'EXPENSE_DECLINED', 'EXPENSE_DISPUTED', 'SETTLEMENT_CREATED', 'SETTLEMENT_CONFIRMED', 'ADMIN_OVERRIDE'];

export default function Audit() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [limit, setLimit] = useState(40);
  const q = useDebounced(search);
  const r = useLoad(() => get(`/admin/audit?limit=${limit}${action ? `&action=${action}` : ''}${q ? `&search=${encodeURIComponent(q)}` : ''}`), [q, action, limit]);
  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Field label="Search" value={search} onChangeText={setSearch} placeholder="Actor, action or details" />
      <Chips value={action} onChange={setAction} options={ACTIONS.map((a) => ({ value: a, label: a ? label(a) : 'All actions' }))} />
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorBox message={r.error} onRetry={r.reload} /> : r.data.logs.length === 0 ? <Empty title="No activity" /> : (
        <>
          <Txt variant="small">{r.data.total} entries (audit log is append-only)</Txt>
          {r.data.logs.map((a: any) => (
            <Card key={a.id} onPress={() => setOpen(open === a.id ? null : a.id)}>
              <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{label(a.action)}</Txt><Txt variant="small">#{a.id}</Txt></Row>
              <Txt variant="sub">{a.actorName ?? 'System / anonymous'} · {a.entityType ?? ''} {a.entityId ?? ''} · {shortDateTime(a.createdAt)}</Txt>
              {open === a.id ? (
                <>
                  {a.metadata ? <Txt variant="small" selectable>meta: {a.metadata}</Txt> : null}
                  {a.previousState ? <Txt variant="small" selectable>before: {a.previousState.slice(0, 600)}</Txt> : null}
                  {a.newState ? <Txt variant="small" selectable>after: {a.newState.slice(0, 600)}</Txt> : null}
                </>
              ) : null}
            </Card>
          ))}
          {r.data.logs.length < r.data.total ? <Btn variant="secondary" title="Load more" onPress={() => setLimit((l) => l + 40)} /> : null}
        </>
      )}
    </Screen>
  );
}
