import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { get } from '@/lib/api';
import { useDebounced, useLoad } from '@/lib/hooks';
import { Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Loading, Row, Screen, Txt } from '@/ui/components';
import { label } from '@/ui/theme';

export default function Users() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounced(search);
  const r = useLoad(() => get(`/users?search=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`), [q, status]);
  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Btn title="Create user" icon="person-add-outline" onPress={() => router.push('/admin/user-new')} />
      <Field label="Search" value={search} onChangeText={setSearch} placeholder="Name, username, email, college" />
      <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, ...['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((s) => ({ value: s, label: label(s) }))]} />
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorBox message={r.error} onRetry={r.reload} /> : r.data.users.length === 0 ? <Empty title="No users" /> : r.data.users.map((u: any) => (
        <Card key={u.id} onPress={() => router.push({ pathname: '/admin/user/[id]', params: { id: u.id } })}>
          <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{u.name}</Txt><Badge text={u.status} /></Row>
          <Row><Txt variant="sub">@{u.username}</Txt><Badge text={u.role} tone="action" /></Row>
          <Txt variant="small">{[u.college, u.department, u.year && `Year ${u.year}`].filter(Boolean).join(' · ')}</Txt>
        </Card>
      ))}
    </Screen>
  );
}
