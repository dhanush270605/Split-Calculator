import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useLoad } from '@/lib/hooks';
import {
  Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Loading, Money, Row, Screen, ScreenHeader, Txt, shortDate,
} from '@/ui/components';
import { label, radius, space, useTheme } from '@/ui/theme';

export default function Trips() {
  const router = useRouter();
  const t = useTheme();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [type, setType] = useState<string>('');
  const q = useDebounced(search);

  const { data, loading, error, refresh, refreshing, reload } = useLoad(
    () => get(`/events?search=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}${type ? `&type=${type}` : ''}`),
    [q, status, type]
  );

  const getTypeGradient = (evType: string): [string, string, ...string[]] => {
    if (evType === 'HACKATHON') return [t.accent, '#A855F7'];
    if (evType === 'HACKATHON_TRIP') return [t.success, '#10B981'];
    return t.gradientPrimary as [string, string, ...string[]];
  };

  const getTypeIcon = (evType: string) => {
    if (evType === 'HACKATHON') return 'code-slash';
    if (evType === 'HACKATHON_TRIP') return 'compass';
    return 'airplane';
  };

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <ScreenHeader
        title={isAdmin ? 'Events Management' : 'My Trips & Events'}
        subtitle="Manage itineraries, expenses, budget & participant settlements"
        right={
          isAdmin ? (
            <Btn title="+ Create Event" variant="primary" small gradient onPress={() => router.push('/event/new')} />
          ) : null
        }
      />

      {/* Search Input */}
      <Field
        label="Search Events"
        value={search}
        onChangeText={setSearch}
        placeholder="Filter by event name, destination or city..."
        prefix="🔍"
      />

      {/* Filter Chips */}
      <View style={{ gap: space.xs }}>
        <Chips
          label="Filter Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'All Statuses' },
            ...['ACTIVE', 'UPCOMING', 'COMPLETED', ...(isAdmin ? ['DRAFT', 'CANCELLED', 'ARCHIVED'] : [])].map((s) => ({
              value: s,
              label: label(s),
            })),
          ]}
        />
        <Chips
          label="Event Type"
          value={type}
          onChange={setType}
          options={[
            { value: '', label: 'All Types' },
            { value: 'TRIP', label: 'Trip', icon: 'airplane-outline' },
            { value: 'HACKATHON', label: 'Hackathon', icon: 'code-slash-outline' },
            { value: 'HACKATHON_TRIP', label: 'Hackathon + Trip', icon: 'compass-outline' },
          ]}
        />
      </View>

      {/* Events List */}
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
            style={{ padding: 0, overflow: 'hidden' }}
          >
            {/* Top Gradient Header Strip */}
            <LinearGradient
              colors={getTypeGradient(e.type)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <Row style={{ gap: space.sm }}>
                  <Ionicons name={getTypeIcon(e.type) as any} size={18} color="#FFFFFF" />
                  <Txt style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 }}>
                    {label(e.type)}
                  </Txt>
                </Row>
                <Badge text={e.status} />
              </Row>
            </LinearGradient>

            {/* Content Details Body */}
            <View style={{ padding: space.lg, gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="h2" style={{ fontWeight: '800' }}>{e.name}</Txt>
                  {e.destination ? (
                    <Row style={{ gap: 4, marginTop: 2 }}>
                      <Ionicons name="location-outline" size={14} color={t.textSub} />
                      <Txt variant="sub" tone="sub">{e.destination}</Txt>
                    </Row>
                  ) : null}
                </View>
              </Row>

              <Row style={{ justifyContent: 'space-between', marginTop: space.xs, paddingTop: space.xs, borderTopWidth: 1, borderColor: t.border }}>
                {e.startDate || e.endDate ? (
                  <Row style={{ gap: space.xs }}>
                    <Ionicons name="calendar-outline" size={14} color={t.textSub} />
                    <Txt variant="small" tone="sub">
                      {shortDate(e.startDate)}{e.endDate && e.endDate !== e.startDate ? ` → ${shortDate(e.endDate)}` : ''}
                    </Txt>
                  </Row>
                ) : <View />}

                <Row style={{ gap: space.sm }}>
                  <Row style={{ gap: 4 }}>
                    <Ionicons name="people-outline" size={14} color={t.primary} />
                    <Txt variant="small" style={{ fontWeight: '700', color: t.primary }}>
                      {e.participantCount} {e.participantCount === 1 ? 'member' : 'members'}
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
