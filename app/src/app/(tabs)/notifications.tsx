import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useLoad } from '@/lib/hooks';
import {
  Badge, Btn, Card, Chips, Empty, ErrorBox, Field, IconButton,
  Row, Screen, SectionTitle, Skeleton, Txt, shortDateTime,
} from '@/ui/components';
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
  const url = `/notifications?limit=60${unreadOnly ? '&unread=true' : ''}${level ? `&level=${level}` : ''}${q ? `&search=${encodeURIComponent(q)}` : ''}`;

  const { data, loading, error, refresh, refreshing, reload } = useLoad(() => get(url), [unreadOnly, level, q]);

  useEffect(() => { reload(false); }, [unreadOnly, level, q]);

  const [open, setOpen] = useState<number | null>(null);

  const read = async (n: any) => {
    if (!n.readAt) {
      await post(`/notifications/${n.id}/read`);
      reload(true);
      refreshUnread();
    }
  };

  const markAllRead = async () => {
    await post('/notifications/read-all');
    reload(true);
    refreshUnread();
  };

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>

      {/* ─ Header ─ */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Txt variant="h1">Notifications</Txt>
          {data?.unreadCount > 0 ? (
            <Txt variant="sub" tone="primary">{data.unreadCount} unread</Txt>
          ) : (
            <Txt variant="sub" tone="muted">All caught up</Txt>
          )}
        </View>
        <Row style={{ gap: 8 }}>
          {isAdmin ? (
            <IconButton
              icon="megaphone-outline"
              size={42}
              iconSize={20}
              onPress={() => router.push('/admin/broadcast')}
              tone="neutral"
            />
          ) : null}
          <Btn
            small
            variant="secondary"
            title="Mark all read"
            icon="checkmark-done-outline"
            onPress={markAllRead}
          />
        </Row>
      </Row>

      {/* ─ Filters ─ */}
      <Chips
        value={unreadOnly ? 'u' : 'a'}
        onChange={(v) => setUnreadOnly(v === 'u')}
        options={[
          { value: 'a', label: 'All' },
          { value: 'u', label: `Unread${data?.unreadCount ? ` (${data.unreadCount})` : ''}` },
        ]}
      />

      {isAdmin ? (
        <View style={{ gap: 10 }}>
          <Chips
            label="Priority Level"
            value={level}
            onChange={setLevel}
            options={[
              { value: '', label: 'Any priority' },
              ...Object.keys(LEVEL_TONE).map((l) => ({ value: l, label: label(l) })),
            ]}
          />
          <Field
            label="Search notifications"
            value={search}
            onChangeText={setSearch}
            placeholder="Filter by keyword..."
          />
        </View>
      ) : null}

      {/* ─ List ─ */}
      <SectionTitle
        title="Notifications"
        action={
          data?.notifications?.length > 0
            ? <Txt variant="small" tone="muted">{data.notifications.length} shown</Txt>
            : undefined
        }
      />

      {loading && !data ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (data?.notifications ?? []).length === 0 ? (
        <Empty
          icon="notifications-off-outline"
          title="All caught up!"
          hint="Notifications about split approvals, debts and event updates will appear here."
        />
      ) : (
        data.notifications.map((n: any) => {
          const isAction = n.level === 'ACTION_REQUIRED';
          const isUnread = !n.readAt;
          const iconName = LEVEL_ICONS[n.level] ?? 'notifications-outline';
          const isOpen = open === n.id;

          return (
            <Card
              key={n.id}
              tone={isAction ? 'action' : undefined}
              style={isUnread ? { borderColor: t.primary, borderWidth: 1.5 } : undefined}
              onPress={() => { setOpen(isOpen ? null : n.id); read(n); }}
            >
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <Row style={{ gap: 10, flex: 1, alignItems: 'flex-start' }}>
                  {/* Unread dot */}
                  <View style={{ paddingTop: 5 }}>
                    {isUnread
                      ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.primary }} />
                      : <View style={{ width: 8, height: 8 }} />}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="h3" numberOfLines={2}>{n.title}</Txt>
                    <Txt variant="small" tone="muted">{shortDateTime(n.createdAt)}</Txt>
                  </View>
                </Row>
                <Row style={{ gap: 6, alignItems: 'center' }}>
                  <Badge text={n.level} tone={LEVEL_TONE[n.level]} />
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={t.textMuted} />
                </Row>
              </Row>

              {isOpen ? (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.border, gap: 8 }}>
                  {n.body ? <Txt variant="body">{n.body}</Txt> : null}
                  {route(n) ? (
                    <Btn
                      small
                      variant="primary"
                      title="View details"
                      icon="open-outline"
                      onPress={() => router.push(route(n))}
                      style={{ alignSelf: 'flex-start' }}
                    />
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
