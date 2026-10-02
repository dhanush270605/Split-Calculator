import React from 'react';
import { useRouter } from 'expo-router';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/hooks';
import { Badge, Banner, Btn, Card, Empty, ErrorBox, Loading, Money, Row, Screen, SectionTitle, Txt, shortDate } from '@/ui/components';
import { formatINR } from '@/lib/money';
import { label } from '@/ui/theme';

function Stat({ title, value, tone }: { title: string; value: React.ReactNode; tone?: any }) {
  return <Card style={{ flex: 1, minWidth: 140 }} tone={tone}><Txt variant="small">{title}</Txt>{typeof value === 'string' || typeof value === 'number' ? <Txt variant="h2">{value}</Txt> : value}</Card>;
}
const Grid = ({ children }: { children: React.ReactNode }) => <Row style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>{children}</Row>;

export default function Home() {
  const { isAdmin, me, queued, flushQueue } = useAuth();
  return isAdmin ? <AdminHome /> : <UserHome name={me?.name ?? ''} queued={queued} flush={flushQueue} />;
}

function UserHome({ name, queued, flush }: { name: string; queued: number; flush: () => Promise<any> }) {
  const router = useRouter();
  const { data: d, loading, error, refresh, refreshing, reload } = useLoad(() => get('/dashboard/me'));
  const n = useLoad(() => get('/notifications?limit=4'));
  return (
    <Screen onRefresh={() => { refresh(); n.refresh(); }} refreshing={refreshing}>
      <Txt variant="title">Hi, {name.split(' ')[0]} 👋</Txt>
      {queued > 0 ? <Banner tone="warn" text={`${queued} expense(s) waiting to sync. They will be sent automatically when you're online.`} /> : null}
      {queued > 0 ? <Btn small variant="secondary" title="Retry sync now" onPress={async () => { await flush(); reload(); }} /> : null}
      {loading && !d ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : d ? (
        <>
          <Card tone={d.netPaise < 0 ? 'danger' : d.netPaise > 0 ? 'success' : undefined}>
            <Txt variant="sub">Your net balance across trips</Txt>
            <Money paise={d.netPaise} signed big />
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="sub">You owe {formatINR(d.owedPaise)}</Txt>
              <Txt variant="sub">You get {formatINR(d.receivablePaise)}</Txt>
            </Row>
          </Card>
          {d.pendingApprovals > 0 ? <Card tone="action" onPress={() => router.push('/expenses')}><Txt variant="h3">{d.pendingApprovals} approval{d.pendingApprovals > 1 ? 's' : ''} waiting for you</Txt><Txt variant="sub">Review shares other people added for you.</Txt></Card> : null}
          {d.pendingSettlements > 0 ? <Card tone="warn" onPress={() => router.push('/settlements')}><Txt variant="h3">{d.pendingSettlements} settlement action{d.pendingSettlements > 1 ? 's' : ''} pending</Txt></Card> : null}
          <Grid>
            <Stat title="Trips" value={`${d.trips.total} (${d.trips.active} active)`} />
            <Stat title="Completed" value={d.trips.completed} />
          </Grid>
          <Grid>
            <Stat title="Total paid by you" value={<Money paise={d.totalSpentPaise} />} />
            <Stat title="Paid for group" value={<Money paise={d.groupPaidPaise} />} />
            <Stat title="Personal spend" value={<Money paise={d.personalPaise} />} />
          </Grid>
          <SectionTitle>Recent expenses</SectionTitle>
          {d.recentExpenses.length === 0 ? <Empty title="No expenses yet" hint="Open a trip and add your first expense." /> : d.recentExpenses.map((e: any) => (
            <Card key={e.id} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}>
              <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{e.title}</Txt><Money paise={e.amountPaise} /></Row>
              <Row><Badge text={e.status} /><Txt variant="small">{e.eventName} · {shortDate(e.spentAt)}</Txt></Row>
            </Card>
          ))}
          <SectionTitle action={<Btn small variant="ghost" title="All" onPress={() => router.push('/notifications')} />}>Recent notifications</SectionTitle>
          {(n.data?.notifications ?? []).map((x: any) => <Card key={x.id} tone={x.level === 'ACTION_REQUIRED' ? 'action' : undefined}><Txt variant="h3">{x.title}</Txt>{x.body ? <Txt variant="sub">{x.body}</Txt> : null}</Card>)}
        </>
      ) : null}
    </Screen>
  );
}

function AdminHome() {
  const router = useRouter();
  const { data: d, loading, error, refresh, refreshing, reload } = useLoad(() => get('/admin/dashboard'));
  if (loading && !d) return <Screen><Loading /></Screen>;
  if (error || !d) return <Screen><ErrorBox message={error ?? 'No data'} onRetry={reload} /></Screen>;
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Txt variant="title">Admin dashboard</Txt>
      <SectionTitle>Users</SectionTitle>
      <Grid><Stat title="Total" value={d.users.total} /><Stat title="Active" value={d.users.active} tone="success" /><Stat title="Inactive" value={d.users.inactive} /></Grid>
      <SectionTitle>Events</SectionTitle>
      <Grid><Stat title="Active" value={d.events.active} tone="success" /><Stat title="Upcoming" value={d.events.upcoming} /><Stat title="Completed" value={d.events.completed} /></Grid>
      <Grid><Stat title="Trips" value={d.events.trips} /><Stat title="Hackathons" value={d.events.hackathons} /><Stat title="Hack + Trip" value={d.events.hybrid} /></Grid>
      <SectionTitle>Expenses</SectionTitle>
      <Grid><Stat title="Total spend" value={<Money paise={d.expenses.totalPaise} />} /><Stat title="Sponsored" value={<Money paise={d.expenses.sponsoredPaise} />} /></Grid>
      <Grid>
        <Stat title="Pending approval" value={d.expenses.pendingApproval} tone={d.expenses.pendingApproval ? 'warn' : undefined} />
        <Stat title="Disputed" value={d.expenses.disputed} tone={d.expenses.disputed ? 'danger' : undefined} />
        <Stat title="Declined" value={d.expenses.declined} />
        <Stat title="Private" value={d.expenses.private} /><Stat title="Public" value={d.expenses.public} />
      </Grid>
      <SectionTitle>Settlements</SectionTitle>
      <Grid><Stat title="Total owed" value={<Money paise={d.settlements.owedPaise} />} /><Stat title="Total receivable" value={<Money paise={d.settlements.receivablePaise} />} /></Grid>
      <Grid><Stat title="Pending settlements" value={d.settlements.pending} /><Stat title="Disputed" value={d.settlements.disputed} /><Stat title="Open expense disputes" value={d.settlements.openDisputes} tone={d.settlements.openDisputes ? 'danger' : undefined} /></Grid>
      <SectionTitle>System</SectionTitle>
      <Grid>
        <Stat title="Errors (24h)" value={d.system.errors24h} tone={d.system.errors24h ? 'danger' : 'success'} />
        <Stat title="Unresolved" value={d.system.unresolvedErrors} /><Stat title="Failed logins (24h)" value={d.system.failedLogins24h} />
        <Stat title="Notification failures" value={d.system.notificationFailures} /><Stat title="Storage failures" value={d.system.storageFailures} />
        <Stat title="DB errors" value={d.system.databaseErrors} /><Stat title="Open problem reports" value={d.system.openProblems} />
      </Grid>
      <SectionTitle>Recently created users</SectionTitle>
      {d.users.recent.map((u: any) => <Card key={u.id} onPress={() => router.push({ pathname: '/admin/user/[id]', params: { id: u.id } })}><Row style={{ justifyContent: 'space-between' }}><Txt variant="h3">{u.name}</Txt><Badge text={u.status} /></Row><Txt variant="small">@{u.username} · {label(u.role)}</Txt></Card>)}
    </Screen>
  );
}
