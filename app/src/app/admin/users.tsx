import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { get } from '@/lib/api';
import { useDebounced, useLoad } from '@/lib/hooks';
import { Avatar, Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Row, Screen, Skeleton, Txt } from '@/ui/components';
import { label } from '@/ui/theme';

export default function Users() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounced(search);
  const r = useLoad(() => get(`/users?search=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`), [q, status]);

  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">User Directory</Txt>
        <Btn title="Create user" icon="person-add-outline" onPress={() => router.push('/admin/user-new')} />
      </Row>

      <Field label="Search users" value={search} onChangeText={setSearch} placeholder="Search by name, username, email, or college..." />
      <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'All users' }, ...['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((s) => ({ value: s, label: label(s) }))]} />

      {r.loading && !r.data ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : r.error ? (
        <ErrorBox message={r.error} onRetry={r.reload} />
      ) : r.data.users.length === 0 ? (
        <Empty icon="people-outline" title="No users found" hint="Try adjusting your search terms or status filters." actionTitle="Create user" onAction={() => router.push('/admin/user-new')} />
      ) : (
        r.data.users.map((u: any) => (
          <Card key={u.id} onPress={() => router.push({ pathname: '/admin/user/[id]', params: { id: u.id } })}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Row style={{ flex: 1, gap: 12, alignItems: 'center' }}>
                <Avatar name={u.name} userId={u.id} size={42} />
                <View style={{ flex: 1 }}>
                  <Row style={{ gap: 6, alignItems: 'center' }}>
                    <Txt variant="h3">{u.name}</Txt>
                    <Badge text={u.role} tone={u.role === 'ADMIN' ? 'action' : 'neutral'} />
                  </Row>
                  <Txt variant="caption" tone="muted">@{u.username} {u.email ? `· ${u.email}` : ''}</Txt>
                  <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    {[u.college, u.department, u.year && `Year ${u.year}`].filter(Boolean).join(' · ') || 'No institution details'}
                  </Txt>
                </View>
              </Row>
              <Badge text={u.status} tone={u.status === 'ACTIVE' ? 'success' : u.status === 'INACTIVE' ? 'warn' : 'danger'} />
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}

