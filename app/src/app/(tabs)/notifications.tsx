import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useLoad } from '@/lib/hooks';
import { Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Loading, Row, Screen, Txt, shortDateTime } from '@/ui/components';
import { LEVEL_TONE, label, useTheme } from '@/ui/theme';

const route = (n: any): any => {
  if (n.entityType === 'EXPENSE' && n.entityId) return { pathname: '/expense/[id]', params: { id: n.entityId } };
  if (n.entityType === 'EVENT' && n.entityId) return { pathname: '/event/[id]', params: { id: n.entityId } };
  if (n.entityType === 'SETTLEMENT' && n.eventId) return { pathname: '/event/[id]', params: { id: n.eventId, tab: 'settle' } };
  if (n.eventId) return { pathname: '/event/[id]', params: { id: n.eventId } };
  return null;
};

export default function Notifications() {
  const router = useRouter();
  const { refreshUnread, isAdmin } = useAuth();
  const t = useTheme();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [level, setLevel] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const { data, loading, error, refresh, refreshing, reload } = useLoad(
    () => get(`/notifications?limit=60${unreadOnly ? '&unread=true' : ''}${level ? `&level=${level}` : ''}${q ? `&search=${encodeURIComponent(q)}` : ''}`), [unreadOnly, level, q]);
  const [open, setOpen] = useState<number | null>(null);

  const read = async (n: any) => {
    if (!n.readAt) { await post(`/notifications/${n.id}/read`); reload(true); refreshUnread(); }
  };
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="h2">{data?.unreadCount ?? 0} unread</Txt>
        <Btn small variant="secondary" title="Mark all read" onPress={async () => { await post('/notifications/read-all'); reload(true); refreshUnread(); }} />
      </Row>
      <Chips value={unreadOnly ? 'u' : 'a'} onChange={(v) => setUnreadOnly(v === 'u')} options={[{ value: 'a', label: 'All' }, { value: 'u', label: 'Unread' }]} />
      {isAdmin ? (
        <>
          <Chips value={level} onChange={setLevel} options={[{ value: '', label: 'Any level' }, ...Object.keys(LEVEL_TONE).map((l) => ({ value: l, label: label(l) }))]} />
          <Field label="Search" value={search} onChangeText={setSearch} placeholder="Search notifications" />
          <Btn small variant="secondary" icon="megaphone-outline" title="Send announcement" onPress={() => router.push('/admin/broadcast')} />
        </>
      ) : null}
      {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : (data?.notifications ?? []).length === 0 ? (
        <Empty icon="notifications-off-outline" title="You're all caught up" />
      ) : data.notifications.map((n: any) => (
        <Card key={n.id} tone={n.level === 'ACTION_REQUIRED' ? 'action' : undefined} style={n.readAt ? undefined : { borderColor: t.primary }} onPress={() => { setOpen(open === n.id ? null : n.id); read(n); }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row style={{ flex: 1 }}>{!n.readAt ? <Txt tone="primary">●</Txt> : null}<Txt variant="h3" style={{ flex: 1 }}>{n.title}</Txt></Row>
            <Badge text={n.level} tone={LEVEL_TONE[n.level]} />
          </Row>
          <Txt variant="small">{shortDateTime(n.createdAt)}</Txt>
          {open === n.id ? (
            <>
              {n.body ? <Txt>{n.body}</Txt> : null}
              {route(n) ? <Btn small variant="secondary" title="Open" onPress={() => router.push(route(n))} /> : null}
            </>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
