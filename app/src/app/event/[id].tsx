import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { del, get, newKey, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg, useLoad } from '@/lib/hooks';
import { formatINR } from '@/lib/money';
import { Badge, Banner, Btn, Card, Chips, Empty, ErrorBox, KV, Loading, Money, Row, Screen, SectionTitle, Txt, confirm, notice, shortDate, shortDateTime } from '@/ui/components';
import { SettlementCard } from '@/ui/settlement-card';
import { label } from '@/ui/theme';

type Tab = 'overview' | 'timeline' | 'expenses' | 'travel' | 'settle' | 'activity';
const STATUSES = ['DRAFT', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED'];

export default function EventScreen() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const eventId = Number(id);
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>((tabParam as Tab) || 'overview');
  const ev = useLoad(() => get(`/events/${eventId}`), [eventId]);
  const e = ev.data?.event;
  if (ev.loading && !e) return <Screen><Loading /></Screen>;
  if (ev.error || !e) return <Screen><ErrorBox message={ev.error ?? 'Not found'} onRetry={ev.reload} /></Screen>;
  const active = e.myMembership === 'ACTIVE' || isAdmin;
  return (
    <Screen onRefresh={ev.refresh} refreshing={ev.refreshing}>
      <Row style={{ justifyContent: 'space-between' }}><Txt variant="title" style={{ flex: 1, fontSize: 22 }}>{e.name}</Txt><Badge text={e.status} /></Row>
      <Row style={{ flexWrap: 'wrap' }}><Badge text={e.type} tone="info" />{e.myMembership && e.myMembership !== 'ACTIVE' && e.myMembership !== 'ADMIN' ? <Badge text={e.myMembership} tone="warn" /> : null}</Row>
      <Txt variant="sub">{shortDate(e.startDate)} → {shortDate(e.endDate)}{e.destination ? ` · ${e.destination}` : ''}</Txt>
      <Chips value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'timeline', label: 'Timeline' }, { value: 'expenses', label: 'Expenses' }, { value: 'travel', label: 'Travel' }, { value: 'settle', label: 'Settle' }, { value: 'activity', label: 'Activity' }]} />
      {tab === 'overview' ? <Overview e={e} reload={() => ev.reload(true)} /> : null}
      {tab === 'timeline' ? <Timeline eventId={eventId} /> : null}
      {tab === 'expenses' ? <EventExpenses eventId={eventId} canAdd={active && ['UPCOMING', 'ACTIVE'].includes(e.status) || isAdmin} /> : null}
      {tab === 'travel' ? <Travel eventId={eventId} canAdd={active} /> : null}
      {tab === 'settle' ? <Settle eventId={eventId} /> : null}
      {tab === 'activity' ? <Activity eventId={eventId} /> : null}
    </Screen>
  );
}

function Overview({ e, reload }: { e: any; reload: () => void }) {
  const router = useRouter();
  const { isAdmin, me } = useAuth();
  const [adding, setAdding] = useState(false);
  const users = useLoad(() => (isAdmin && adding ? get('/users?limit=200') : Promise.resolve(null)), [adding]);
  const act = async (fn: () => Promise<any>) => { try { await fn(); reload(); } catch (x) { notice('Could not update', errMsg(x)); } };
  const h = e.hackathon, t = e.trip;
  const members = e.participants.filter((p: any) => p.status === 'ACTIVE');
  const others = e.participants.filter((p: any) => p.status !== 'ACTIVE');
  const candidates = (users.data?.users ?? []).filter((u: any) => u.status === 'ACTIVE' && !members.some((p: any) => p.id === u.id));
  return (
    <>
      {isAdmin ? (
        <Card>
          <Txt variant="h3">Admin controls</Txt>
          <Chips label="Status" value={e.status} onChange={(s: string) => act(() => patch(`/events/${e.id}`, { status: s }))} options={STATUSES.map((s) => ({ value: s, label: label(s) }))} />
          <Row style={{ flexWrap: 'wrap' }}>
            <Btn small variant="secondary" title="Edit / extend" icon="create-outline" onPress={() => router.push({ pathname: '/event/new', params: { id: e.id } })} />
            <Btn small variant="secondary" title="Report" icon="stats-chart-outline" onPress={() => router.push({ pathname: '/admin/report/[id]', params: { id: e.id } })} />
            <Btn small variant="secondary" title="Announce" icon="megaphone-outline" onPress={() => router.push({ pathname: '/admin/broadcast', params: { eventId: e.id } })} />
          </Row>
        </Card>
      ) : null}
      {e.description ? <Card><Txt>{e.description}</Txt></Card> : null}
      <Card>
        <Txt variant="h3">Event details</Txt>
        <KV k="Starts from" v={e.startLocation} /><KV k="Destination" v={e.destination} /><KV k="Organizer" v={e.organizer} /><KV k="College" v={e.college} /><KV k="Notes" v={e.notes} />
      </Card>
      {h ? (
        <Card>
          <Txt variant="h3">Hackathon</Txt>
          <KV k="Name" v={h.hackathonName} /><KV k="Host" v={[h.hostOrg, h.hostCollege].filter(Boolean).join(' · ')} /><KV k="Venue" v={[h.venue, h.city, h.state].filter(Boolean).join(', ')} />
          <KV k="Mode" v={h.mode ? label(h.mode) : ''} /><KV k="Registration" v={h.registrationStatus} /><KV k="Deadline" v={h.registrationDeadline} /><KV k="Participation" v={h.participationType} />
          <KV k="College approved" v={h.collegeApproved == null ? '' : h.collegeApproved ? `Yes${h.approvalStatus ? ` (${h.approvalStatus})` : ''}` : 'No'} />
          <KV k="Independent travel" v={h.independent == null ? '' : h.independent ? 'Yes' : 'No'} /><KV k="Team" v={h.teamName} /><KV k="Team members" v={h.teamMembers} />
          <KV k="Documents" v={h.requiredDocuments} /><KV k="Accommodation" v={h.accommodation} /><KV k="Food" v={h.food} /><KV k="Transport" v={h.transport} /><KV k="URL" v={h.eventUrl} /><KV k="Registration details" v={h.registrationDetails} />
        </Card>
      ) : null}
      {t ? (
        <Card>
          <Txt variant="h3">Trip</Txt>
          <KV k="Stops" v={t.intermediateLocations} /><KV k="Return to" v={t.returnDestination} /><KV k="Stay" v={t.accommodation} /><KV k="Food" v={t.food} /><KV k="Tickets" v={t.tickets} /><KV k="Notes" v={t.notes} />
        </Card>
      ) : null}
      {e.itinerary.length ? (
        <>
          <SectionTitle>Itinerary</SectionTitle>
          {e.itinerary.map((i: any) => <Card key={i.id}><Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>Day {i.day}{i.time ? ` · ${i.time}` : ''} — {i.title}</Txt><Badge text={i.kind} tone="neutral" /></Row>{i.location ? <Txt variant="sub">{i.location}</Txt> : null}{i.description ? <Txt variant="sub">{i.description}</Txt> : null}</Card>)}
        </>
      ) : null}
      {e.budget.length ? (
        <>
          <SectionTitle>Budget vs actual</SectionTitle>
          <Card>{e.budget.map((b: any) => (
            <Row key={b.category} style={{ justifyContent: 'space-between' }}>
              <Txt style={{ flex: 1 }}>{label(b.category)}</Txt>
              <Txt tone={b.budgetPaise && b.actualPaise > b.budgetPaise ? 'danger' : undefined}>{formatINR(b.actualPaise)} / {b.budgetPaise ? formatINR(b.budgetPaise) : 'no budget'}</Txt>
            </Row>))}
          </Card>
        </>
      ) : null}
      {e.checklist.length ? (
        <>
          <SectionTitle>Checklist</SectionTitle>
          <Card>{e.checklist.map((c: any) => (
            <Row key={c.id} style={{ justifyContent: 'space-between' }}>
              <Txt style={{ flex: 1, textDecorationLine: c.done ? 'line-through' : 'none' }}>{c.title}{c.userName ? ` (${c.userName})` : ''}</Txt>
              <Btn small variant={c.done ? 'secondary' : 'primary'} title={c.done ? 'Undo' : 'Done'} onPress={() => act(() => post(`/events/${e.id}/checklist/${c.id}/toggle`))} />
            </Row>))}
          </Card>
        </>
      ) : null}
      <SectionTitle action={isAdmin ? <Btn small variant="secondary" title={adding ? 'Close' : 'Add people'} onPress={() => setAdding((a) => !a)} /> : undefined}>{`Participants (${members.length})`}</SectionTitle>
      {adding && isAdmin ? (
        <Card>
          <Txt variant="sub">Only registered, active users can be added.</Txt>
          {candidates.length === 0 ? <Txt variant="sub">Nobody else to add.</Txt> : candidates.map((u: any) => (
            <Row key={u.id} style={{ justifyContent: 'space-between' }}><Txt>{u.name} (@{u.username})</Txt><Btn small title="Add" onPress={() => act(() => post(`/events/${e.id}/participants`, { userIds: [u.id] }))} /></Row>
          ))}
        </Card>
      ) : null}
      <Card>
        {members.map((p: any) => (
          <Row key={p.id} style={{ justifyContent: 'space-between' }}>
            <Txt style={{ flex: 1 }}>{p.name}{p.id === me?.id ? ' (you)' : ''}</Txt>
            <Txt variant="small">{p.college ?? ''}</Txt>
            {isAdmin ? <Btn small variant="ghost" title="Remove" onPress={async () => {
              if (!(await confirm('Remove participant?', `${p.name} keeps their expense history but can no longer take part.`, 'Remove'))) return;
              try { const r = await del(`/events/${e.id}/participants/${p.id}`); if (r.warning) notice('Removed', r.warning); reload(); } catch (x) { notice('Could not remove', errMsg(x)); }
            }} /> : null}
          </Row>
        ))}
        {others.length ? <Txt variant="small">Left / removed: {others.map((p: any) => p.name).join(', ')}</Txt> : null}
      </Card>
      {!isAdmin && e.myMembership === 'ACTIVE' ? <Btn variant="ghost" title="Leave this event" onPress={async () => {
        if (!(await confirm('Leave event?', 'You can only leave when your balance is settled.', 'Leave'))) return;
        try { await post(`/events/${e.id}/leave`); reload(); } catch (x) { notice('Cannot leave yet', errMsg(x)); }
      }} /> : null}
    </>
  );
}

function Timeline({ eventId }: { eventId: number }) {
  const router = useRouter();
  const r = useLoad(() => get(`/events/${eventId}/timeline`), [eventId]);
  if (r.loading && !r.data) return <Loading />;
  if (r.error) return <ErrorBox message={r.error} onRetry={r.reload} />;
  const items = r.data.timeline;
  if (!items.length) return <Empty icon="time-outline" title="Nothing on the timeline yet" />;
  return <>{items.map((i: any) => i.kind === 'EXPENSE' ? (
    <Card key={`e${i.id}`} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: i.id } })}>
      <Row style={{ justifyContent: 'space-between' }}><Txt variant="small">{shortDateTime(i.at)}</Txt><Money paise={i.amountPaise} /></Row><Txt variant="h3">{i.title}</Txt>
      <Row><Badge text={i.category} tone="neutral" /><Badge text={i.status} />{i.visibility === 'PRIVATE' ? <Badge text="Private" tone="action" /> : null}</Row>
    </Card>
  ) : (
    <Card key={`t${i.id}`}><Txt variant="small">{shortDateTime(i.at)}</Txt><Txt variant="h3">🚆 {i.fromLocation} → {i.toLocation}</Txt><Row><Badge text={i.transportType} tone="info" /><Badge text={i.bookingStatus} /></Row></Card>
  ))}</>;
}

function EventExpenses({ eventId, canAdd }: { eventId: number; canAdd: boolean }) {
  const router = useRouter();
  const [mine, setMine] = useState(false);
  const r = useLoad(() => get(`/expenses?eventId=${eventId}&limit=100${mine ? '&mine=true' : ''}`), [eventId, mine]);
  return (
    <>
      {canAdd ? <Btn title="Add expense" icon="add" onPress={() => router.push({ pathname: '/expense/new', params: { eventId } })} /> : null}
      <Chips value={mine ? 'mine' : 'all'} onChange={(v) => setMine(v === 'mine')} options={[{ value: 'all', label: 'All visible' }, { value: 'mine', label: 'Mine' }]} />
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorBox message={r.error} onRetry={r.reload} /> : r.data.expenses.length === 0 ? <Empty title="No expenses" /> : r.data.expenses.map((x: any) => (
        <Card key={x.id} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: x.id } })}>
          <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{x.title}</Txt><Money paise={x.amountPaise} /></Row>
          <Row style={{ flexWrap: 'wrap' }}><Badge text={x.status} />{x.visibility === 'PRIVATE' ? <Badge text="Private" tone="action" /> : null}{!['INDIVIDUAL', 'GROUP_MEMBER'].includes(x.payerType) ? <Badge text="Sponsored" tone="info" /> : null}</Row>
          <Txt variant="small">{label(x.category)} · paid by {x.payerName ?? '—'} · {shortDate(x.spentAt)}{x.myApproval ? ` · your share ${formatINR(x.mySharePaise)} (${label(x.myApproval)})` : ''}</Txt>
        </Card>
      ))}
    </>
  );
}

function Travel({ eventId, canAdd }: { eventId: number; canAdd: boolean }) {
  const router = useRouter();
  const r = useLoad(() => get(`/events/${eventId}/travel`), [eventId]);
  return (
    <>
      {canAdd ? <Btn title="Add travel segment" icon="add" onPress={() => router.push({ pathname: '/travel-new', params: { eventId } })} /> : null}
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorBox message={r.error} onRetry={r.reload} /> : r.data.segments.length === 0 ? <Empty icon="bus-outline" title="No travel added" /> : r.data.segments.map((s: any) => (
        <Card key={s.id}>
          <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{s.fromLocation} → {s.toLocation}</Txt><Badge text={s.bookingStatus} /></Row>
          <Row><Badge text={s.transportType} tone="info" />{s.ticketAmountPaise ? <Money paise={s.ticketAmountPaise} /> : null}</Row>
          <Txt variant="small">{shortDateTime(s.departureAt)} → {shortDateTime(s.arrivalAt)}</Txt>
          <KV k="Vehicle" v={s.vehicleDetails} /><KV k="Booked by" v={s.bookedByName} /><KV k="Paid by" v={s.payerName} /><KV k="Confirmation" v={s.confirmationNumber} /><KV k="Notes" v={s.notes} />
          <Txt variant="sub">Passengers: {s.passengers.map((p: any) => p.name).join(', ') || '—'}</Txt>
        </Card>
      ))}
    </>
  );
}

function Settle({ eventId }: { eventId: number }) {
  const { me, isAdmin, refreshUnread } = useAuth();
  const r = useLoad(() => get(`/events/${eventId}/settlement`), [eventId]);
  const s = useLoad(() => get(`/events/${eventId}/summary`), [eventId]);
  const reload = () => { r.reload(true); s.reload(true); refreshUnread(); };
  if (r.loading && !r.data) return <Loading />;
  if (r.error || !r.data) return <ErrorBox message={r.error ?? 'No data'} onRetry={r.reload} />;
  const d = r.data, f = s.data?.financial;
  const pay = async (t: any) => {
    if (!(await confirm('Record payment', `Mark ${formatINR(t.amountPaise)} as paid to ${t.toName}? They will be asked to confirm.`, 'I paid'))) return;
    try { await post('/settlements', { eventId, toUserId: t.toUserId, amountPaise: t.amountPaise, method: 'UPI', idempotencyKey: newKey() }); reload(); } catch (x) { notice('Could not record payment', errMsg(x)); }
  };
  return (
    <>
      {f ? (
        <Card>
          <Txt variant="h3">Financial summary</Txt>
          <KV k="Total event spending" v={formatINR(f.totalPaise)} /><KV k="College / sponsor paid" v={formatINR(f.sponsoredPaise)} /><KV k="Group expenses" v={formatINR(f.groupPaise)} />
          <KV k="Personal spending" v={formatINR(f.personalPaise)} /><KV k="Awaiting approval (not in balances)" v={formatINR(f.pendingPaise)} /><KV k="Outstanding to settle" v={formatINR(f.outstandingPaise)} /><KV k="Settled (confirmed)" v={formatINR(f.settledPaise)} />
        </Card>
      ) : null}
      <Card tone={d.myNetPaise < 0 ? 'danger' : d.myNetPaise > 0 ? 'success' : undefined}>
        <Txt variant="sub">{isAdmin ? 'Balances' : 'Your balance'}</Txt>
        {!isAdmin ? <Money paise={d.myNetPaise} signed big /> : null}
        <Txt variant="small">Only approved shares count. Positive = should receive, negative = owes.</Txt>
      </Card>
      <SectionTitle>Who owes whom</SectionTitle>
      {d.suggestions.length === 0 ? <Banner tone="success" text="Everyone is settled for now 🎉" /> : d.suggestions.map((t: any, i: number) => (
        <Card key={i}>
          <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{t.fromName} → {t.toName}</Txt><Money paise={t.amountPaise} /></Row>
          {t.fromUserId === me?.id ? <Btn small title="I paid this" onPress={() => pay(t)} /> : null}
        </Card>
      ))}
      <SectionTitle>Balances</SectionTitle>
      <Card>{d.balances.map((b: any) => (
        <Row key={b.userId} style={{ justifyContent: 'space-between' }}>
          <Txt style={{ flex: 1 }}>{b.name}{b.userId === me?.id ? ' (you)' : ''}</Txt>
          <Txt variant="small">paid {formatINR(b.paidPaise)} · own {formatINR(b.owedPaise)}</Txt>
          <Money paise={b.netPaise} signed />
        </Row>))}
      </Card>
      <SectionTitle>Payments</SectionTitle>
      {d.payments.length === 0 ? <Empty title="No payments recorded" /> : d.payments.map((p: any) => <SettlementCard key={p.id} s={p} meId={me!.id} isAdmin={isAdmin} onChanged={reload} />)}
    </>
  );
}

function Activity({ eventId }: { eventId: number }) {
  const r = useLoad(() => get(`/events/${eventId}/activity?limit=60`), [eventId]);
  if (r.loading && !r.data) return <Loading />;
  if (r.error) return <ErrorBox message={r.error} onRetry={r.reload} />;
  if (!r.data.activity.length) return <Empty title="No activity yet" />;
  return <>{r.data.activity.map((a: any) => <Card key={a.id}><Txt variant="h3">{label(a.action)}</Txt><Txt variant="sub">{a.actorName ?? 'System'} · {shortDateTime(a.createdAt)}</Txt></Card>)}</>;
}
