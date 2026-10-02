import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useLoad } from '@/lib/hooks';
import { Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Loading, Money, Row, Screen, Txt, shortDate } from '@/ui/components';
import { label } from '@/ui/theme';

export default function Trips() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const q = useDebounced(search);
  const { data, loading, error, refresh, refreshing, reload } = useLoad(() => get(`/events?search=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`), [q, status]);
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      {isAdmin ? <Btn title="Create event" icon="add" onPress={() => router.push('/event/new')} /> : null}
      <Field label="Search" value={search} onChangeText={setSearch} placeholder="Name or destination" />
      <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, ...['ACTIVE', 'UPCOMING', 'COMPLETED', ...(isAdmin ? ['DRAFT', 'CANCELLED', 'ARCHIVED'] : [])].map((s) => ({ value: s, label: label(s) }))]} />
      {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : (data?.events ?? []).length === 0 ? (
        <Empty icon="airplane-outline" title="No events" hint={isAdmin ? 'Create a trip, hackathon or hackathon + trip.' : 'You have not been added to any event yet. Ask your admin.'} />
      ) : data.events.map((e: any) => (
        <Card key={e.id} onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}>
          <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{e.name}</Txt><Badge text={e.status} /></Row>
          <Row><Badge text={e.type} tone="info" /><Txt variant="sub">{e.destination ?? ''}</Txt></Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small">{shortDate(e.startDate)} → {shortDate(e.endDate)} · {e.participantCount} people</Txt>
            {!isAdmin ? <Money paise={e.myNetPaise ?? 0} signed /> : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
