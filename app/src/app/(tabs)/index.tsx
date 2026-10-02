import React from 'react';
import { Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/hooks';
import {
  Avatar, Badge, Banner, Btn, Card, Empty, ErrorBox, IconButton,
  Loading, Money, ProgressBar, Row, Screen, SectionTitle, SpendingChart, StatCard, Txt,
  shortDate,
} from '@/ui/components';
import { formatINR } from '@/lib/money';
import { radius, space, useTheme } from '@/ui/theme';

export default function Home() {
  const { isAdmin, me, queued, flushQueue } = useAuth();
  return isAdmin
    ? <AdminHome />
    : <UserHome name={me?.name ?? ''} avatarId={me?.avatarAttachmentId} queued={queued} flush={flushQueue} />;
}

// ─── User Home ────────────────────────────────────────────────────────────────
function UserHome({ name, avatarId, queued, flush }: {
  name: string; avatarId?: number | null; queued: number; flush: () => Promise<any>;
}) {
  const router = useRouter();
  const t = useTheme();
  const { data: d, loading, error, refresh, refreshing, reload } = useLoad(() => get('/dashboard/me'));
  const n = useLoad(() => get('/notifications?limit=4'));
  const firstName = name.split(' ')[0] || 'User';

  return (
    <Screen onRefresh={() => { refresh(); n.refresh(); }} refreshing={refreshing}>

      {/* ─ Greeting Header ─ */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Row style={{ gap: 14 }}>
          <Avatar name={name} avatarAttachmentId={avatarId} size={46} />
          <View>
            <Txt variant="h2" style={{ fontWeight: '800' }}>Hi, {firstName} 👋</Txt>
            <Txt variant="sub" tone="muted">Welcome to Split Calculator</Txt>
          </View>
        </Row>
        <IconButton
          icon="notifications-outline"
          onPress={() => router.push('/notifications')}
          tone="neutral"
          size={44}
          iconSize={22}
        />
      </Row>

      {/* ─ Offline Sync Warning ─ */}
      {queued > 0 ? (
        <Card tone="warn">
          <Row style={{ justifyContent: 'space-between' }}>
            <Row style={{ gap: space.sm, flex: 1 }}>
              <Ionicons name="cloud-offline-outline" size={20} color={t.warn} />
              <Txt variant="sub" style={{ flex: 1 }}>
                {queued} expense{queued > 1 ? 's' : ''} waiting to sync
              </Txt>
            </Row>
            <Btn title="Sync Now" small variant="secondary" onPress={async () => { await flush(); reload(); }} />
          </Row>
        </Card>
      ) : null}

      {loading && !d ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : d ? (
        <>
          {/* ─ Hero Net Balance Card ─ */}
          <LinearGradient
            colors={t.gradientPrimary as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 24, padding: space.xl, gap: 16 }}
          >
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                  NET BALANCE
                </Text>
                <Text style={{
                  color: '#FFFFFF', fontSize: 36, fontWeight: '800',
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 4, letterSpacing: -1,
                }}>
                  {d.netPaise >= 0 ? '+' : ''}{formatINR(d.netPaise)}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 }}>
                  {d.netPaise >= 0 ? 'You are owed money' : 'You owe money overall'}
                </Text>
              </View>
              <Btn
                title="+ Add"
                variant="secondary"
                small
                onPress={() => router.push('/expense/new')}
                style={{ backgroundColor: 'rgba(255,255,255,0.95)' }}
              />
            </Row>

            <Row style={{ gap: 12 }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', padding: 14, borderRadius: 14 }}>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' }}>You Owe</Text>
                <Text style={{ color: '#FCA5A5', fontSize: 18, fontWeight: '800', marginTop: 3, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                  {formatINR(d.owedPaise)}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', padding: 14, borderRadius: 14 }}>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' }}>You Get</Text>
                <Text style={{ color: '#6EE7B7', fontSize: 18, fontWeight: '800', marginTop: 3, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                  {formatINR(d.receivablePaise)}
                </Text>
              </View>
            </Row>
          </LinearGradient>

          {/* ─ Quick Stats ─ */}
          <Row style={{ gap: space.sm }}>
            <StatCard
              title="Active Trips"
              value={String(d.trips.active)}
              subtitle={`of ${d.trips.total} total`}
              icon="airplane"
              tone="info"
              onPress={() => router.push('/trips')}
            />
            <StatCard
              title="Settle Up"
              value="View"
              subtitle="Min. payments"
              icon="swap-horizontal"
              tone="success"
              onPress={() => router.push('/settlements')}
            />
          </Row>

          {/* ─ Action Required ─ */}
          {d.pendingApprovals > 0 || d.pendingSettlements > 0 ? (
            <Card
              tone="action"
              onPress={() => router.push(d.pendingApprovals > 0 ? '/expenses' : '/settlements')}
            >
              <Row style={{ gap: 14 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.actionBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="time" size={24} color={t.action} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="h3">Action Required</Txt>
                  <Txt variant="sub" tone="sub">
                    {d.pendingApprovals > 0
                      ? `${d.pendingApprovals} expense approval${d.pendingApprovals > 1 ? 's' : ''} waiting`
                      : `${d.pendingSettlements} payment${d.pendingSettlements > 1 ? 's' : ''} to confirm`}
                  </Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.textSub} />
              </Row>
            </Card>
          ) : null}

          {/* ─ Spending Stats ─ */}
          <SectionTitle title="Spending Overview" />
          <Row style={{ gap: space.sm }}>
            <StatCard title="Paid By You" value={<Money paise={d.totalSpentPaise} />} icon="cash" tone="primary" />
            <StatCard title="For Group" value={<Money paise={d.groupPaidPaise} />} icon="people" tone="accent" />
          </Row>

          {/* ─ Category Chart ─ */}
          {d.categoryBreakdown && d.categoryBreakdown.length > 0 ? (
            <Card>
              <Txt variant="h3">Spending by Category</Txt>
              <SpendingChart
                items={d.categoryBreakdown.map((c: any) => ({ label: c.category, amountPaise: c.amountPaise }))}
              />
            </Card>
          ) : null}

          {/* ─ Recent Expenses ─ */}
          <SectionTitle
            title="Recent Expenses"
            action={<Btn small variant="ghost" title="See All" onPress={() => router.push('/expenses')} />}
          />
          {d.recentExpenses.length === 0 ? (
            <Empty
              icon="receipt-outline"
              title="No expenses yet"
              hint="Create a trip and add your first group expense."
              actionLabel="+ Add Expense"
              onAction={() => router.push('/expense/new')}
            />
          ) : (
            d.recentExpenses.map((e: any) => (
              <Card key={e.id} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Row style={{ gap: 12, flex: 1 }}>
                    <View style={{
                      width: 42, height: 42, borderRadius: 12, backgroundColor: t.primaryMuted,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ionicons name="receipt-outline" size={20} color={t.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="h3" numberOfLines={1}>{e.title}</Txt>
                      <Txt variant="small" tone="muted" numberOfLines={1}>{e.eventName} · {shortDate(e.spentAt)}</Txt>
                    </View>
                  </Row>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
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

// ─── Admin Home ───────────────────────────────────────────────────────────────
function AdminHome() {
  const router = useRouter();
  const t = useTheme();
  const { data: d, loading, error, refresh, refreshing, reload } = useLoad(() => get('/admin/dashboard'));

  if (loading && !d) return <Screen><Loading /></Screen>;
  if (error || !d) return <Screen><ErrorBox message={error ?? 'No data'} onRetry={reload} /></Screen>;

  const totalErrors = d.system.errors24h ?? 0;

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>

      {/* ─ Header ─ */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Txt variant="h1" style={{ fontWeight: '800' }}>Admin Dashboard</Txt>
          <Txt variant="sub" tone="muted">System & financial oversight</Txt>
        </View>
        <Badge text="ADMIN" tone="action" />
      </Row>

      {/* ─ Quick Actions ─ */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Btn title="+ Event" small variant="primary" gradient onPress={() => router.push('/event/new')} />
        <Btn title="+ User" small variant="secondary" onPress={() => router.push('/admin/user-new')} />
        <Btn title="Broadcast" small variant="secondary" icon="megaphone-outline" onPress={() => router.push('/admin/broadcast')} />
        <Btn title="Audit" small variant="ghost" icon="shield-outline" onPress={() => router.push('/admin/audit')} />
      </View>

      {/* ─ System Health Hero ─ */}
      <Card tone={totalErrors > 0 ? 'danger' : 'success'} onPress={() => router.push('/admin/errors')}>
        <Row style={{ gap: 14 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: totalErrors > 0 ? t.dangerBg : t.successBg,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons
              name={totalErrors > 0 ? 'alert-circle' : 'checkmark-circle'}
              size={28}
              color={totalErrors > 0 ? t.danger : t.success}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="h3">System Status</Txt>
            <Txt variant="sub" tone={totalErrors > 0 ? 'danger' : 'success'}>
              {totalErrors > 0 ? `${totalErrors} errors in last 24h` : 'All systems operational'}
            </Txt>
            <Txt variant="small" tone="muted">
              {d.system.unresolvedErrors} unresolved · {d.system.openProblems} open reports
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.textSub} />
        </Row>
      </Card>

      {/* ─ KPI Stats ─ */}
      <SectionTitle title="Users & Events" />
      <Row style={{ gap: space.sm }}>
        <StatCard
          title="Active Users"
          value={String(d.users.active)}
          subtitle={`Total ${d.users.total}`}
          icon="people"
          tone="success"
          onPress={() => router.push('/admin/users')}
        />
        <StatCard
          title="Active Events"
          value={String(d.events.active)}
          subtitle={`Total ${d.events.active + d.events.upcoming + d.events.completed}`}
          icon="calendar"
          tone="info"
          onPress={() => router.push('/trips')}
        />
      </Row>

      <SectionTitle title="Expenses & Financials" />
      <Row style={{ gap: space.sm }}>
        <StatCard title="Total Volume" value={<Money paise={d.expenses.totalPaise} />} icon="cash" tone="primary" />
        <StatCard title="Sponsored" value={<Money paise={d.expenses.sponsoredPaise} />} icon="business" tone="accent" />
      </Row>
      <Row style={{ gap: space.sm }}>
        <StatCard
          title="Pending Approval"
          value={String(d.expenses.pendingApproval)}
          icon="time"
          tone={d.expenses.pendingApproval > 0 ? 'warn' : 'neutral'}
          onPress={() => router.push('/expenses')}
        />
        <StatCard
          title="Open Disputes"
          value={String(d.expenses.disputed)}
          icon="warning"
          tone={d.expenses.disputed > 0 ? 'danger' : 'neutral'}
          onPress={() => router.push('/admin/disputes')}
        />
      </Row>

      {/* ─ Recent Users ─ */}
      <SectionTitle
        title="Recent Users"
        action={<Btn small variant="ghost" title="Manage all" onPress={() => router.push('/admin/users')} />}
      />
      {d.users.recent.length === 0 ? (
        <Empty icon="people-outline" title="No users yet" />
      ) : (
        d.users.recent.map((u: any) => (
          <Card key={u.id} onPress={() => router.push({ pathname: '/admin/user/[id]', params: { id: u.id } })}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Row style={{ gap: 12, flex: 1 }}>
                <Avatar name={u.name} avatarAttachmentId={u.avatarAttachmentId} size={38} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" numberOfLines={1}>{u.name}</Txt>
                  <Txt variant="small" tone="muted">@{u.username} · {u.role}</Txt>
                </View>
              </Row>
              <Badge text={u.status} />
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}
