import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useLoad } from '@/lib/hooks';
import {
  Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Loading, Money,
  Row, Screen, SectionTitle, Txt, shortDate,
} from '@/ui/components';
import { label, radius, space, useTheme } from '@/ui/theme';

export default function Trips() {
  const router = useRouter();
  const t = useTheme();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const q = useDebounced(search);

  const { data, loading, error, refresh, refreshing, reload } = useLoad(
    () => get(`/events?search=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}${type ? `&type=${type}` : ''}`),
    [q, status, type]
  );

  useEffect(() => { reload(false); }, [q, status, type]);

  const getTypeGradient = (evType: string): [string, string, ...string[]] => {
    if (evType === 'HACKATHON') return ['#7C3AED', '#A855F7'];
    if (evType === 'HACKATHON_TRIP') return ['#059669', '#10B981'];
    return t.gradientPrimary as [string, string, ...string[]];
  };

  const getTypeIcon = (evType: string) => {
    if (evType === 'HACKATHON') return 'code-slash';
    if (evType === 'HACKATHON_TRIP') return 'compass';
    return 'airplane';
  };

  const statusOptions = ['ACTIVE', 'UPCOMING', 'COMPLETED', ...(isAdmin ? ['DRAFT', 'CANCELLED', 'ARCHIVED'] : [])];

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>

      {/* ─ Header ─ */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Txt variant="h1">{isAdmin ? 'Events' : 'My Trips'}</Txt>
          <Txt variant="sub" tone="muted">
            {isAdmin ? 'Manage all events' : 'Your trips & hackathons'}
          </Txt>
        </View>
        {isAdmin ? (
          <Btn title="+ Create" variant="primary" small gradient onPress={() => router.push('/event/new')} />
        ) : null}
      </Row>

      {/* ─ Search ─ */}
      <Field
        label="Search Events"
        value={search}
        onChangeText={setSearch}
        placeholder="Filter by event name, destination..."
      />

      {/* ─ Filters ─ */}
      <Chips
        value={status}
        onChange={setStatus}
        options={[
          { value: '', label: 'All' },
          ...statusOptions.map((s) => ({ value: s, label: label(s) })),
        ]}
      />
      <Chips
        value={type}
        onChange={setType}
        options={[
          { value: '', label: 'All Types' },
          { value: 'TRIP', label: 'Trip', icon: 'airplane-outline' },
          { value: 'HACKATHON', label: 'Hackathon', icon: 'code-slash-outline' },
          { value: 'HACKATHON_TRIP', label: 'Hack + Trip', icon: 'compass-outline' },
        ]}
      />

      {/* ─ List ─ */}
      <SectionTitle
        title={`Events${data?.events?.length ? ` (${data.events.length})` : ''}`}
      />

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (data?.events ?? []).length === 0 ? (
        <Empty
          icon="airplane-outline"
          title="No events found"
          hint={isAdmin ? 'Create a new trip, hackathon or hackathon + trip event.' : 'You have not been added to any event matching your filter.'}
          actionLabel={isAdmin ? '+ Create Event' : undefined}
          onAction={isAdmin ? () => router.push('/event/new') : undefined}
        />
      ) : (
        data.events.map((e: any) => (
          <Card
            key={e.id}
            onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
            style={{ padding: 0, overflow: 'hidden', gap: 0 }}
          >
            {/* Gradient header strip */}
            <LinearGradient
              colors={getTypeGradient(e.type)}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ paddingHorizontal: space.lg, paddingVertical: 12 }}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <Row style={{ gap: 8 }}>
                  <Ionicons name={getTypeIcon(e.type) as any} size={16} color="#FFF" />
                  <Txt style={{ color: '#FFF', fontWeight: '700', fontSize: 12, letterSpacing: 0.3 }}>
                    {label(e.type)}
                  </Txt>
                </Row>
                <Badge text={e.status} />
              </Row>
            </LinearGradient>

            {/* Content */}
            <View style={{ padding: space.lg, gap: 10 }}>
              <Txt variant="h2" numberOfLines={1}>{e.name}</Txt>
              {e.destination ? (
                <Row style={{ gap: 4 }}>
                  <Ionicons name="location-outline" size={13} color={t.textSub} />
                  <Txt variant="small" tone="sub" numberOfLines={1}>{e.destination}</Txt>
                </Row>
              ) : null}

              <Row style={{ justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: t.border }}>
                {e.startDate || e.endDate ? (
                  <Row style={{ gap: 6 }}>
                    <Ionicons name="calendar-outline" size={13} color={t.textSub} />
                    <Txt variant="small" tone="sub">
                      {shortDate(e.startDate)}
                      {e.endDate && e.endDate !== e.startDate ? ` → ${shortDate(e.endDate)}` : ''}
                    </Txt>
                  </Row>
                ) : <View />}

                <Row style={{ gap: 12 }}>
                  <Row style={{ gap: 4 }}>
                    <Ionicons name="people-outline" size={13} color={t.primary} />
                    <Txt variant="small" style={{ fontWeight: '700', color: t.primary }}>
                      {e.participantCount}
                    </Txt>
                  </Row>
                  {!isAdmin && e.myNetPaise !== undefined ? (
                    <Money paise={e.myNetPaise} signed />
                  ) : null}
                </Row>
              </Row>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
