import React from 'react';
import { useRouter } from 'expo-router';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/hooks';
import { Card, Empty, ErrorBox, Loading, Money, Row, Screen, SectionTitle, Txt } from '@/ui/components';
import { SettlementCard } from '@/ui/settlement-card';
import { formatINR } from '@/lib/money';
import { label } from '@/ui/theme';

export default function Settlements() {
  const router = useRouter();
  const { me, isAdmin, refreshUnread } = useAuth();
  const ev = useLoad(() => get('/events?limit=100'));
  const st = useLoad(() => get('/settlements?limit=50'));
  const reload = () => { st.reload(true); ev.reload(true); refreshUnread(); };
  return (
    <Screen onRefresh={() => { st.refresh(); ev.refresh(); }} refreshing={st.refreshing}>
      {!isAdmin ? (
        <>
          <SectionTitle>Balances by event</SectionTitle>
          {ev.loading && !ev.data ? <Loading /> : (ev.data?.events ?? []).length === 0 ? <Empty title="No events yet" /> : ev.data.events.map((e: any) => (
            <Card key={e.id} onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id, tab: 'settle' } })}>
              <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{e.name}</Txt><Money paise={e.myNetPaise ?? 0} signed /></Row>
              <Txt variant="small">{(e.myNetPaise ?? 0) < 0 ? 'You owe money' : (e.myNetPaise ?? 0) > 0 ? 'You should receive money' : 'All settled'}</Txt>
            </Card>
          ))}
        </>
      ) : null}
      <SectionTitle>{isAdmin ? 'All settlement payments' : 'My payments'}</SectionTitle>
      {st.loading && !st.data ? <Loading /> : st.error ? <ErrorBox message={st.error} onRetry={st.reload} /> : (st.data?.settlements ?? []).length === 0 ? (
        <Empty icon="swap-horizontal-outline" title="No payments yet" hint="Payments you make or receive show up here." />
      ) : st.data.settlements.map((s: any) => <SettlementCard key={s.id} s={s} meId={me!.id} isAdmin={isAdmin} onChanged={reload} />)}
      <Txt variant="small">Status flow: {['PENDING', 'PAID', 'CONFIRMED'].map(label).join(' → ')} (or Disputed / Cancelled)</Txt>
    </Screen>
  );
}

