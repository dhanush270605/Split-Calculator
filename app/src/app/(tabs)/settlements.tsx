import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/hooks';
import {
  Card, Empty, ErrorBox, Money, Row, Screen, SectionTitle, Skeleton, Txt,
} from '@/ui/components';
import { SettlementCard } from '@/ui/settlement-card';
import { label, radius, space, useTheme } from '@/ui/theme';

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

  const statuses = ['PENDING', 'PAID', 'CONFIRMED'];

  return (
    <Screen onRefresh={() => { st.refresh(); ev.refresh(); }} refreshing={st.refreshing}>

      {/* ─ Header ─ */}
      <View>
        <Txt variant="h1">{isAdmin ? 'Settlements' : 'Settle Up'}</Txt>
        <Txt variant="sub" tone="muted">
          {isAdmin ? 'All payment transactions' : 'Your balances & payment history'}
        </Txt>
      </View>

      {/* ─ User: Balances by Event ─ */}
      {!isAdmin ? (
        <>
          <SectionTitle title="Balances by Event" />

          {ev.loading && !ev.data ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={80} />
              <Skeleton height={80} />
            </View>
          ) : (ev.data?.events ?? []).length === 0 ? (
            <Empty
              icon="calendar-outline"
              title="No active events"
              hint="Join a trip or event to track group balances."
            />
          ) : (
            ev.data.events.map((e: any) => {
              const net = e.myNetPaise ?? 0;
              const isOwed = net > 0;
              const owes = net < 0;
              return (
                <Card
                  key={e.id}
                  onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id, tab: 'settle' } })}
                  tone={isOwed ? 'success' : owes ? 'danger' : undefined}
                >
                  <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Txt variant="h3" numberOfLines={1}>{e.name}</Txt>
                      <Txt variant="small" tone={owes ? 'danger' : isOwed ? 'success' : 'muted'}>
                        {owes ? 'You owe money' : isOwed ? 'You are owed' : 'All settled ✓'}
                      </Txt>
                    </View>
                    <Money paise={net} signed />
                  </Row>
                </Card>
              );
            })
          )}
        </>
      ) : null}

      {/* ─ Payment History ─ */}
      <SectionTitle title={isAdmin ? 'All Payments' : 'Payment History'} />

      {st.loading && !st.data ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={110} />
          <Skeleton height={110} />
        </View>
      ) : st.error ? (
        <ErrorBox message={st.error} onRetry={st.reload} />
      ) : (st.data?.settlements ?? []).length === 0 ? (
        <Empty
          icon="swap-horizontal-outline"
          title="No payment records"
          hint="Settlement transactions between members will appear here once expenses are recorded."
        />
      ) : (
        st.data.settlements.map((s: any) => (
          <SettlementCard key={s.id} s={s} meId={me!.id} isAdmin={isAdmin} onChanged={reload} />
        ))
      )}

      {/* ─ Status Lifecycle Guide ─ */}
      <View style={{
        backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: space.md,
        flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, justifyContent: 'center',
      }}>
        <Ionicons name="information-circle-outline" size={14} color={t.textMuted} />
        {statuses.map((s, i) => (
          <Row key={s} style={{ gap: 4 }}>
            <Text style={{ fontSize: 11, color: t.textMuted, fontWeight: '600' }}>{label(s)}</Text>
            {i < statuses.length - 1 && <Ionicons name="arrow-forward" size={11} color={t.textMuted} />}
          </Row>
        ))}
        <Text style={{ fontSize: 11, color: t.textMuted }}>(or Disputed/Cancelled)</Text>
      </View>
    </Screen>
  );
}
