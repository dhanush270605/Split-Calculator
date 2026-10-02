import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/hooks';
import { Card, Empty, ErrorBox, Money, Row, Screen, SectionTitle, Skeleton, Txt } from '@/ui/components';
import { SettlementCard } from '@/ui/settlement-card';
import { label, useTheme } from '@/ui/theme';

export default function Settlements() {
  const router = useRouter();
  const { me, isAdmin, refreshUnread } = useAuth();
  const t = useTheme();
  const ev = useLoad(() => get('/events?limit=100'));
  const st = useLoad(() => get('/settlements?limit=50'));

  const reload = () => {
    st.reload(true);
    ev.reload(true);
    refreshUnread();
  };

  return (
    <Screen onRefresh={() => { st.refresh(); ev.refresh(); }} refreshing={st.refreshing}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">{isAdmin ? 'Settlement Management' : 'Settlements & Balances'}</Txt>
      </Row>

      {!isAdmin ? (
        <>
          <SectionTitle>Balances by Event</SectionTitle>
          {ev.loading && !ev.data ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={75} />
              <Skeleton height={75} />
            </View>
          ) : (ev.data?.events ?? []).length === 0 ? (
            <Empty icon="calendar-outline" title="No active events" hint="Join or create a trip/event to track balances." />
          ) : (
            ev.data.events.map((e: any) => {
              const net = e.myNetPaise ?? 0;
              return (
                <Card key={e.id} onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id, tab: 'settle' } })} tone={net > 0 ? 'success' : net < 0 ? 'danger' : undefined}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Txt variant="h3">{e.name}</Txt>
                      <Txt variant="caption" tone={net < 0 ? 'danger' : net > 0 ? 'success' : 'muted'}>
                        {net < 0 ? 'You owe money in this event' : net > 0 ? 'You are owed money in this event' : 'All balances settled'}
                      </Txt>
                    </View>
                    <Money paise={net} signed big />
                  </Row>
                </Card>
              );
            })
          )}
        </>
      ) : null}

      <SectionTitle>{isAdmin ? 'All Settlement Payments' : 'Payment History'}</SectionTitle>
      {st.loading && !st.data ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={100} />
          <Skeleton height={100} />
        </View>
      ) : st.error ? (
        <ErrorBox message={st.error} onRetry={st.reload} />
      ) : (st.data?.settlements ?? []).length === 0 ? (
        <Empty icon="swap-horizontal-outline" title="No payment records yet" hint="Settlement transactions between members will appear here." />
      ) : (
        st.data.settlements.map((s: any) => (
          <SettlementCard key={s.id} s={s} meId={me!.id} isAdmin={isAdmin} onChanged={reload} />
        ))
      )}

      {/* Lifecycle Flow Legend */}
      <View style={{ marginTop: 16, padding: 12, backgroundColor: t.surfaceAlt, borderRadius: 12 }}>
        <Txt variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          Payment Status Lifecycle: {['PENDING', 'PAID', 'CONFIRMED'].map(label).join(' → ')} (or Disputed / Cancelled)
        </Txt>
      </View>
    </Screen>
  );
}


