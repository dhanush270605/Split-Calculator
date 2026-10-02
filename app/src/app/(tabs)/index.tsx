import React from 'react';
import { Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/hooks';
import {
  Avatar, Badge, Banner, Btn, Card, Empty, ErrorBox, IconButton, Loading, Money, ProgressBar, Row, Screen, SectionTitle, SpendingChart, StatCard, Txt, shortDate,
} from '@/ui/components';
import { formatINR } from '@/lib/money';
import { radius, space, useTheme } from '@/ui/theme';

export default function Home() {
  const { isAdmin, me, queued, flushQueue } = useAuth();
  return isAdmin ? <AdminHome /> : <UserHome name={me?.name ?? ''} avatarId={me?.avatarAttachmentId} queued={queued} flush={flushQueue} />;
}

function UserHome({ name, avatarId, queued, flush }: { name: string; avatarId?: number | null; queued: number; flush: () => Promise<any> }) {
  const router = useRouter();
  const t = useTheme();
  const { data: d, loading, error, refresh, refreshing, reload } = useLoad(() => get('/dashboard/me'));
  const n = useLoad(() => get('/notifications?limit=4'));

  const firstName = name.split(' ')[0] || 'User';

  return (
    <Screen onRefresh={() => { refresh(); n.refresh(); }} refreshing={refreshing}>
      {/* Header Greeting Bar */}
      <Row style={{ justifyContent: 'space-between', marginBottom: space.xs }}>
        <Row style={{ gap: space.md }}>
          <Avatar name={name} avatarAttachmentId={avatarId} size={48} />
          <View>
            <Txt variant="h2" style={{ fontWeight: '800' }}>Hi, {firstName} 👋</Txt>
            <Txt variant="sub" tone="sub">Welcome to Split Calculator</Txt>
          </View>
        </Row>
        <IconButton icon="notifications-outline" onPress={() => router.push('/notifications')} tone="neutral" size={42} iconSize={20} />
      </Row>

      {/* Offline Sync Banner */}
      {queued > 0 ? (
        <Card tone="warn">
          <Row style={{ justifyContent: 'space-between' }}>
            <Row style={{ gap: space.sm, flex: 1 }}>
              <Ionicons name="cloud-offline-outline" size={20} color={t.warn} />
              <Txt variant="sub" style={{ flex: 1 }}>
                {queued} expense(s) waiting to sync offline.
              </Txt>
            </Row>
            <Btn title="Sync Now" small variant="secondary" onPress={async () => { await flush(); reload(); }} />
          </Row>
        </Card>
      ) : null}

      {loading && !d ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : d ? (
        <>
          {/* Hero Balance Card */}
          <LinearGradient
            colors={t.gradientPrimary as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: radius.xl,
              padding: space.xl,
              gap: space.md,
              ...t.shadowLg,
            }}
          >
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Txt variant="small" style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Net Balance Across Trips
                </Txt>
                <Text style={{ color: '#FFFFFF', fontSize: 34, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 4 }}>
                  {d.netPaise > 0 ? '+' : ''}{formatINR(d.netPaise)}
                </Text>
              </View>
              <Btn
                title="+ Add Expense"
                variant="secondary"
                small
                onPress={() => router.push('/expense/new')}
                style={{ backgroundColor: '#FFFFFF' }}
              />
            </Row>

            <Row style={{ gap: space.md, marginTop: space.xs }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', padding: space.md, borderRadius: radius.lg }}>
                <Txt variant="small" style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>You Owe</Txt>
                <Text style={{ color: '#F87171', fontSize: 18, fontWeight: '800', marginTop: 2 }}>{formatINR(d.owedPaise)}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', padding: space.md, borderRadius: radius.lg }}>
                <Txt variant="small" style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>You Get</Txt>
                <Text style={{ color: '#34D399', fontSize: 18, fontWeight: '800', marginTop: 2 }}>{formatINR(d.receivablePaise)}</Text>
              </View>
            </Row>
          </LinearGradient>

          {/* Quick Actions Navigation Bar */}
          <Row style={{ gap: space.sm, justifyContent: 'space-between' }}>
            <StatCard title="Active Trips" value={`${d.trips.active}`} subtitle={`out of ${d.trips.total}`} icon="airplane" tone="info" onPress={() => router.push('/trips')} />
            <StatCard title="Settle Up" value="View Debt" subtitle="Minimal payments" icon="swap-horizontal" tone="success" onPress={() => router.push('/settlements')} />
          </Row>

          {/* Action Required Banner Strip */}
          {d.pendingApprovals > 0 || d.pendingSettlements > 0 ? (
            <Card tone="action" onPress={() => router.push(d.pendingApprovals > 0 ? '/expenses' : '/settlements')}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row style={{ gap: space.md, flex: 1 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.actionBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="time" size={22} color={t.action} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3">Action Required</Txt>
                    <Txt variant="sub" tone="sub">
                      {d.pendingApprovals > 0 ? `${d.pendingApprovals} expense approval(s) waiting` : `${d.pendingSettlements} settlement payment(s) to confirm`}
                    </Txt>
                  </View>
                </Row>
                <Ionicons name="chevron-forward" size={20} color={t.textSub} />
              </Row>
            </Card>
          ) : null}

          {/* Spending Stats Summary */}
          <SectionTitle>Spending Overview</SectionTitle>
          <Row style={{ gap: space.sm }}>
            <StatCard title="Total Paid By You" value={<Money paise={d.totalSpentPaise} />} icon="cash" tone="primary" />
            <StatCard title="Paid for Group" value={<Money paise={d.groupPaidPaise} />} icon="people" tone="accent" />
          </Row>

          {/* Spending Category Breakdown */}
          {d.categoryBreakdown && d.categoryBreakdown.length > 0 ? (
            <Card style={{ padding: space.lg }}>
              <Txt variant="h3">Spending by Category</Txt>
              <SpendingChart
                items={d.categoryBreakdown.map((c: any) => ({
                  label: c.category,
                  amountPaise: c.amountPaise,
                }))}
              />
            </Card>
          ) : null}

          {/* Recent Expenses List */}
          <SectionTitle action={<Btn small variant="ghost" title="See All" onPress={() => router.push('/expenses')} />}>
            Recent Expenses
          </SectionTitle>
          {d.recentExpenses.length === 0 ? (
            <Empty icon="receipt-outline" title="No expenses recorded yet" hint="Create a trip or add your first expense." actionLabel="+ Add Expense" onAction={() => router.push('/expense/new')} />
          ) : (
            d.recentExpenses.map((e: any) => (
              <Card key={e.id} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row style={{ gap: space.md, flex: 1 }}>
                    <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="receipt-outline" size={20} color={t.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="h3" numberOfLines={1}>{e.title}</Txt>
                      <Txt variant="small" tone="sub">{e.eventName} • {shortDate(e.spentAt)}</Txt>
                    </View>
                  </Row>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Money paise={e.amountPaise} />
                    <Badge text={e.status} />
                  </View>
                </Row>
              </Card>
            ))
          )}
        </>
      ) : null}
    </Screen>
  );
}

function AdminHome() {
  const router = useRouter();
  const t = useTheme();
  const { data: d, loading, error, refresh, refreshing, reload } = useLoad(() => get('/admin/dashboard'));

  if (loading && !d) return <Screen><Loading /></Screen>;
  if (error || !d) return <Screen><ErrorBox message={error ?? 'No data'} onRetry={reload} /></Screen>;

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      {/* Admin Header Title */}
      <Row style={{ justifyContent: 'space-between', marginBottom: space.xs }}>
        <View>
          <Txt variant="h1" style={{ fontWeight: '800' }}>Admin Dashboard</Txt>
          <Txt variant="sub" tone="sub">System status, user management & financial oversight</Txt>
        </View>
        <Badge text="ADMIN CONSOLE" tone="action" />
      </Row>

      {/* Quick Actions Row */}
      <Row style={{ gap: space.sm, flexWrap: 'wrap' }}>
        <Btn title="+ Create Event" small variant="primary" onPress={() => router.push('/event/new')} />
        <Btn title="+ Create User" small variant="secondary" onPress={() => router.push('/admin/user-new')} />
        <Btn title="Announcement" small variant="secondary" icon="megaphone-outline" onPress={() => router.push('/admin/broadcast')} />
        <Btn title="Audit Logs" small variant="ghost" icon="shield-outline" onPress={() => router.push('/admin/audit')} />
      </Row>

      {/* KPI Stats Grid */}
      <SectionTitle>Users & Events</SectionTitle>
      <Row style={{ gap: space.sm }}>
        <StatCard title="Active Users" value={d.users.active} subtitle={`Total ${d.users.total}`} icon="people" tone="success" onPress={() => router.push('/admin/users')} />
        <StatCard title="Active Events" value={d.events.active} subtitle={`Total ${d.events.active + d.events.upcoming + d.events.completed}`} icon="calendar" tone="info" onPress={() => router.push('/trips')} />
      </Row>

      {/* Expense Stats */}
      <SectionTitle>Expenses & Financials</SectionTitle>
      <Row style={{ gap: space.sm }}>
        <StatCard title="Total Volume" value={<Money paise={d.expenses.totalPaise} />} icon="cash" tone="primary" />
        <StatCard title="Sponsored" value={<Money paise={d.expenses.sponsoredPaise} />} icon="business" tone="accent" />
      </Row>
      <Row style={{ gap: space.sm }}>
        <StatCard title="Pending Approval" value={d.expenses.pendingApproval} icon="time" tone={d.expenses.pendingApproval ? 'warn' : 'neutral'} />
        <StatCard title="Open Disputes" value={d.expenses.disputed} icon="warning" tone={d.expenses.disputed ? 'danger' : 'neutral'} onPress={() => router.push('/admin/disputes')} />
      </Row>

      {/* System Errors & Health */}
      <SectionTitle>System Health</SectionTitle>
      <Card tone={d.system.errors24h > 0 ? 'danger' : 'success'} onPress={() => router.push('/admin/errors')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row style={{ gap: space.md, flex: 1 }}>
            <Ionicons name={d.system.errors24h > 0 ? 'alert-circle' : 'checkmark-circle'} size={28} color={d.system.errors24h > 0 ? t.danger : t.success} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">System Status ({d.system.errors24h} errors in 24h)</Txt>
              <Txt variant="sub" tone="sub">Unresolved: {d.system.unresolvedErrors} • Open Problem Reports: {d.system.openProblems}</Txt>
            </View>
          </Row>
          <Ionicons name="chevron-forward" size={20} color={t.textSub} />
        </Row>
      </Card>

      {/* Recently Created Users */}
      <SectionTitle action={<Btn small variant="ghost" title="Manage All" onPress={() => router.push('/admin/users')} />}>
        Recently Created Users
      </SectionTitle>
      {d.users.recent.map((u: any) => (
        <Card key={u.id} onPress={() => router.push({ pathname: '/admin/user/[id]', params: { id: u.id } })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row style={{ gap: space.md }}>
              <Avatar name={u.name} avatarAttachmentId={u.avatarAttachmentId} size={36} />
              <View>
                <Txt variant="h3">{u.name}</Txt>
                <Txt variant="small" tone="sub">@{u.username} • {u.role}</Txt>
              </View>
            </Row>
            <Badge text={u.status} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
