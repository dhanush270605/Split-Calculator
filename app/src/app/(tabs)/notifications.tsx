import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useLoad } from '@/lib/hooks';
import { Badge, Btn, Card, Chips, Empty, ErrorBox, Field, IconButton, Row, Screen, Skeleton, Txt, shortDateTime } from '@/ui/components';
import { LEVEL_TONE, label, useTheme } from '@/ui/theme';

const LEVEL_ICONS: Record<string, string> = {
  INFO: 'information-circle-outline',
  SUCCESS: 'checkmark-circle-outline',
  WARNING: 'warning-outline',
  ERROR: 'alert-circle-outline',
  ACTION_REQUIRED: 'time-outline',
};

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
    () => get(`/notifications?limit=60${unreadOnly ? '&unread=true' : ''}${level ? `&level=${level}` : ''}${q ? `&search=${encodeURIComponent(q)}` : ''}`),
    [unreadOnly, level, q]
  );
  const [open, setOpen] = useState<number | null>(null);

  const read = async (n: any) => {
    if (!n.readAt) {
      await post(`/notifications/${n.id}/read`);
      reload(true);
      refreshUnread();
    }
  };

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">Notifications</Txt>
        <Btn small variant="secondary" title="Mark all read" icon="checkmark-done-outline" onPress={async () => {
          await post('/notifications/read-all');
          reload(true);
          refreshUnread();
        }} />
      </Row>

      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Chips value={unreadOnly ? 'u' : 'a'} onChange={(v) => setUnreadOnly(v === 'u')} options={[{ value: 'a', label: 'All Notifications' }, { value: 'u', label: `Unread (${data?.unreadCount ?? 0})` }]} />
        {isAdmin ? (
          <IconButton icon="megaphone-outline" size={18} onPress={() => router.push('/admin/broadcast')} />
        ) : null}
      </Row>

      {isAdmin ? (
        <View style={{ gap: 8, marginVertical: 4 }}>
          <Chips value={level} onChange={setLevel} options={[{ value: '', label: 'Any priority' }, ...Object.keys(LEVEL_TONE).map((l) => ({ value: l, label: label(l) }))]} />
          <Field label="Search notifications" value={search} onChangeText={setSearch} placeholder="Filter by keyword..." />
        </View>
      ) : null}

      {loading && !data ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (data?.notifications ?? []).length === 0 ? (
        <Empty icon="notifications-off-outline" title="All caught up!" hint="Notifications about split approvals, debts and event updates will appear here." />
      ) : (
        data.notifications.map((n: any) => {
          const isAction = n.level === 'ACTION_REQUIRED';
          const isUnread = !n.readAt;
          return (
            <Card key={n.id} tone={isAction ? 'action' : isUnread ? 'neutral' : undefined} style={isUnread ? { borderColor: t.primary, borderWidth: 1.5 } : undefined} onPress={() => { setOpen(open === n.id ? null : n.id); read(n); }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <Row style={{ flex: 1, gap: 8, alignItems: 'center', marginRight: 8 }}>
                  {isUnread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.primary }} /> : null}
                  <Txt variant="h3" style={{ flex: 1 }}>{n.title}</Txt>
                </Row>
                <Badge text={n.level} tone={LEVEL_TONE[n.level]} />
              </Row>

              <Txt variant="caption" tone="muted" style={{ marginBottom: 4 }}>{shortDateTime(n.createdAt)}</Txt>

              {open === n.id ? (
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.border, gap: 8 }}>
                  {n.body ? <Txt variant="body">{n.body}</Txt> : null}
                  {route(n) ? (
                    <Btn small variant="primary" title="View details" icon="open-outline" onPress={() => router.push(route(n))} style={{ alignSelf: 'flex-start' }} />
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

