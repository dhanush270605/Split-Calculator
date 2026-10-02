import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { del, get, newKey, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg, useLoad } from '@/lib/hooks';
import { formatINR } from '@/lib/money';
import {
  Avatar, Badge, Banner, Btn, Card, Chips, Empty, ErrorBox, Field, KV, Loading, ModalDialog, Money, ProgressBar, Row, Screen, SectionTitle, Txt, confirm, notice, shortDate, shortDateTime,
} from '@/ui/components';
import { SettlementCard } from '@/ui/settlement-card';
import { label, radius, space, useTheme } from '@/ui/theme';

type Tab = 'overview' | 'timeline' | 'expenses' | 'travel' | 'settle' | 'activity';
const STATUSES = ['DRAFT', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED'];

export default function EventScreen() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const eventId = Number(id);
  const router = useRouter();
  const t = useTheme();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>((tabParam as Tab) || 'overview');

  const ev = useLoad(() => get(`/events/${eventId}`), [eventId]);
  const e = ev.data?.event;

  if (ev.loading && !e) return <Screen><Loading /></Screen>;
  if (ev.error || !e) return <Screen><ErrorBox message={ev.error ?? 'Event not found'} onRetry={ev.reload} /></Screen>;

  const active = e.myMembership === 'ACTIVE' || isAdmin;

  const getTypeGradient = (evType: string): [string, string, ...string[]] => {
    if (evType === 'HACKATHON') return [t.accent, '#A855F7'];
    if (evType === 'HACKATHON_TRIP') return [t.success, '#10B981'];
    return t.gradientPrimary as [string, string, ...string[]];
  };

  return (
    <Screen onRefresh={ev.refresh} refreshing={ev.refreshing}>
      {/* Hero Banner Header */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <LinearGradient
          colors={getTypeGradient(e.type)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: space.xl, gap: space.sm }}
        >
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Badge text={e.type} tone="neutral" />
            <Badge text={e.status} />
          </Row>

          <Txt variant="h1" style={{ color: '#FFFFFF', fontWeight: '800' }}>
            {e.name}
          </Txt>

          <Row style={{ gap: space.md, flexWrap: 'wrap' }}>
            {e.destination ? (
              <Row style={{ gap: 4 }}>
                <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.9)" />
                <Txt style={{ color: '#FFFFFF', fontWeight: '600' }}>{e.destination}</Txt>
              </Row>
            ) : null}
            <Row style={{ gap: 4 }}>
              <Ionicons name="calendar-outline" size={16} color="rgba(255,255,255,0.9)" />
              <Txt style={{ color: '#FFFFFF', fontWeight: '600' }}>
                {shortDate(e.startDate)} → {shortDate(e.endDate)}
              </Txt>
            </Row>
          </Row>

          {/* Participant Avatars Bar */}
          <Row style={{ marginTop: space.xs, gap: space.sm }}>
            <Row style={{ gap: -8 }}>
              {e.participants.slice(0, 5).map((p: any) => (
                <Avatar key={p.id} name={p.name} avatarAttachmentId={p.avatarAttachmentId} size={32} style={{ borderWidth: 2, borderColor: '#FFFFFF' }} />
              ))}
            </Row>
            <Txt style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 13 }}>
              {e.participants.length} {e.participants.length === 1 ? 'Participant' : 'Participants'}
            </Txt>
          </Row>
        </LinearGradient>
      </Card>

      {/* Segmented Tab Navigation Bar */}
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview', icon: 'information-circle-outline' },
          { value: 'timeline', label: 'Timeline', icon: 'time-outline' },
          { value: 'expenses', label: 'Expenses', icon: 'receipt-outline' },
          { value: 'travel', label: 'Travel', icon: 'bus-outline' },
          { value: 'settle', label: 'Settle', icon: 'swap-horizontal-outline' },
          { value: 'activity', label: 'Activity', icon: 'list-outline' },
        ]}
      />

      {/* Selected Tab Views */}
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
  const t = useTheme();
  const { isAdmin, me } = useAuth();
  const [adding, setAdding] = useState(false);
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [checklistTitle, setChecklistTitle] = useState('');

  const users = useLoad(() => (isAdmin && adding ? get('/users?limit=200') : Promise.resolve(null)), [adding]);
  const act = async (fn: () => Promise<any>) => {
    try {
      await fn();
      reload();
    } catch (x) {
      notice('Could not update', errMsg(x));
    }
  };

  const submitAddChecklist = async () => {
    if (!checklistTitle.trim()) return;
    try {
      await post(`/events/${e.id}/checklist`, { title: checklistTitle.trim() });
      setChecklistTitle('');
      setAddingChecklist(false);
      reload();
    } catch (x) {
      notice('Error', errMsg(x));
    }
  };

  const h = e.hackathon;
  const tr = e.trip;
  const members = e.participants.filter((p: any) => p.status === 'ACTIVE');
  const others = e.participants.filter((p: any) => p.status !== 'ACTIVE');
  const candidates = (users.data?.users ?? []).filter((u: any) => u.status === 'ACTIVE' && !members.some((p: any) => p.id === u.id));

  return (
    <>
      {isAdmin ? (
        <Card tone="action">
          <Txt variant="h3">Admin Controls</Txt>
          <Chips
            label="Change Event Status"
            value={e.status}
            onChange={(s: string) => act(() => patch(`/events/${e.id}`, { status: s }))}
            options={STATUSES.map((s) => ({ value: s, label: label(s) }))}
          />
          <Row style={{ flexWrap: 'wrap', gap: space.sm, marginTop: space.xs }}>
            <Btn small variant="secondary" title="Edit / Extend Event" icon="create-outline" onPress={() => router.push({ pathname: '/event/new', params: { id: e.id } })} />
            <Btn small variant="secondary" title="Financial Report" icon="stats-chart-outline" onPress={() => router.push({ pathname: '/admin/report/[id]', params: { id: e.id } })} />
            <Btn small variant="secondary" title="Broadcast Message" icon="megaphone-outline" onPress={() => router.push({ pathname: '/admin/broadcast', params: { eventId: e.id } })} />
          </Row>
        </Card>
      ) : null}

      {e.description ? (
        <Card>
          <Txt variant="h3">Description</Txt>
          <Txt variant="body">{e.description}</Txt>
        </Card>
      ) : null}

      <Card>
        <Txt variant="h3">Event Details</Txt>
        <KV k="Starts From" v={e.startLocation} />
        <KV k="Destination" v={e.destination} />
        <KV k="Organizer" v={e.organizer} />
        <KV k="College / Host" v={e.college} />
        <KV k="Notes" v={e.notes} />
      </Card>

      {h ? (
        <Card>
          <Txt variant="h3">Hackathon Info</Txt>
          <KV k="Name" v={h.hackathonName} />
          <KV k="Host" v={[h.hostOrg, h.hostCollege].filter(Boolean).join(' · ')} />
          <KV k="Venue" v={[h.venue, h.city, h.state].filter(Boolean).join(', ')} />
          <KV k="Mode" v={h.mode ? label(h.mode) : ''} />
          <KV k="Registration" v={h.registrationStatus} />
          <KV k="Deadline" v={h.registrationDeadline} />
          <KV k="Participation Type" v={h.participationType} />
          <KV k="College Approved" v={h.collegeApproved == null ? '' : h.collegeApproved ? `Yes${h.approvalStatus ? ` (${h.approvalStatus})` : ''}` : 'No'} />
          <KV k="Independent Travel" v={h.independent == null ? '' : h.independent ? 'Yes' : 'No'} />
          <KV k="Team Name" v={h.teamName} />
          <KV k="Team Members" v={h.teamMembers} />
          <KV k="Documents Required" v={h.requiredDocuments} />
          <KV k="Accommodation" v={h.accommodation} />
          <KV k="Food Details" v={h.food} />
          <KV k="Transport Details" v={h.transport} />
          <KV k="Website URL" v={h.eventUrl} />
        </Card>
      ) : null}

      {tr ? (
        <Card>
          <Txt variant="h3">Trip Info</Txt>
          <KV k="Intermediate Stops" v={tr.intermediateLocations} />
          <KV k="Return Destination" v={tr.returnDestination} />
          <KV k="Accommodation" v={tr.accommodation} />
          <KV k="Food Arrangements" v={tr.food} />
          <KV k="Tickets / Passes" v={tr.tickets} />
          <KV k="Notes" v={tr.notes} />
        </Card>
      ) : null}

      {/* Itinerary Timeline */}
      {e.itinerary.length ? (
        <>
          <SectionTitle>Itinerary Schedule</SectionTitle>
          {e.itinerary.map((i: any) => (
            <Card key={i.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="h3" style={{ flex: 1 }}>
                  Day {i.day}{i.time ? ` • ${i.time}` : ''} — {i.title}
                </Txt>
                <Badge text={i.kind} tone="neutral" />
              </Row>
              {i.location ? <Txt variant="sub" tone="sub">📍 {i.location}</Txt> : null}
              {i.description ? <Txt variant="body">{i.description}</Txt> : null}
            </Card>
          ))}
        </>
      ) : null}

      {/* Budget vs Actual Progress Bars */}
      {e.budget.length ? (
        <>
          <SectionTitle>Budget vs Actual Spend</SectionTitle>
          <Card>
            {e.budget.map((b: any) => {
              const pct = b.budgetPaise ? b.actualPaise / b.budgetPaise : 0;
              const isOver = b.budgetPaise && b.actualPaise > b.budgetPaise;
              return (
                <View key={b.category} style={{ gap: 4, marginVertical: 4 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt style={{ fontWeight: '600' }}>{label(b.category)}</Txt>
                    <Txt tone={isOver ? 'danger' : 'sub'} style={{ fontWeight: '700' }}>
                      {formatINR(b.actualPaise)} / {b.budgetPaise ? formatINR(b.budgetPaise) : 'No limit'}
                    </Txt>
                  </Row>
                  {b.budgetPaise ? (
                    <ProgressBar progress={pct} tone={isOver ? 'danger' : 'primary'} />
                  ) : null}
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {/* Checklist */}
      <SectionTitle
        action={
          isAdmin ? (
            <Btn small variant="ghost" title="+ Add Item" onPress={() => setAddingChecklist(true)} />
          ) : undefined
        }
      >
        Checklist Items
      </SectionTitle>

      <ModalDialog visible={addingChecklist} onClose={() => setAddingChecklist(false)} title="Add Checklist Item">
        <Field label="Item Title" value={checklistTitle} onChangeText={setChecklistTitle} placeholder="e.g. Bring College ID Cards" />
        <Btn title="Add to Checklist" variant="primary" onPress={submitAddChecklist} />
      </ModalDialog>

      {e.checklist.length === 0 ? (
        <Empty icon="checkbox-outline" title="No checklist items" hint="Add tasks, reminders or document checklists." />
      ) : (
        <Card>
          {e.checklist.map((c: any) => (
            <Row key={c.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Row style={{ gap: space.md, flex: 1 }}>
                <Ionicons
                  name={c.done ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={c.done ? t.success : t.textSub}
                  onPress={() => act(() => post(`/events/${e.id}/checklist/${c.id}/toggle`))}
                />
                <Txt style={{ flex: 1, textDecorationLine: c.done ? 'line-through' : 'none', color: c.done ? t.textSub : t.text }}>
                  {c.title}{c.userName ? ` (${c.userName})` : ''}
                </Txt>
              </Row>
              <Btn small variant={c.done ? 'secondary' : 'ghost'} title={c.done ? 'Undo' : 'Done'} onPress={() => act(() => post(`/events/${e.id}/checklist/${c.id}/toggle`))} />
            </Row>
          ))}
        </Card>
      )}

      {/* Participants */}
      <SectionTitle action={isAdmin ? <Btn small variant="secondary" title={adding ? 'Close' : '+ Add Members'} onPress={() => setAdding((a) => !a)} /> : undefined}>
        {`Participants (${members.length})`}
      </SectionTitle>

      {adding && isAdmin ? (
        <Card tone="info">
          <Txt variant="sub">Only registered, active users can be added to events.</Txt>
          {candidates.length === 0 ? (
            <Txt variant="sub">All active registered users are already added.</Txt>
          ) : (
            candidates.map((u: any) => (
              <Row key={u.id} style={{ justifyContent: 'space-between' }}>
                <Row style={{ gap: space.sm }}>
                  <Avatar name={u.name} avatarAttachmentId={u.avatarAttachmentId} size={32} />
                  <Txt>{u.name} (@{u.username})</Txt>
                </Row>
                <Btn small title="Add" onPress={() => act(() => post(`/events/${e.id}/participants`, { userIds: [u.id] }))} />
              </Row>
            ))
          )}
        </Card>
      ) : null}

      <Card>
        {members.map((p: any) => (
          <Row key={p.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <Row style={{ gap: space.sm, flex: 1 }}>
              <Avatar name={p.name} avatarAttachmentId={p.avatarAttachmentId} size={32} />
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: '600' }}>{p.name}{p.id === me?.id ? ' (you)' : ''}</Txt>
                {p.college ? <Txt variant="small" tone="sub">{p.college}</Txt> : null}
              </View>
            </Row>
            {isAdmin ? (
              <Btn
                small
                variant="ghost"
                title="Remove"
                onPress={async () => {
                  if (!(await confirm('Remove participant?', `${p.name} keeps their expense history but will be removed from future settlements.`, 'Remove'))) return;
                  try {
                    const res = await del(`/events/${e.id}/participants/${p.id}`);
                    if (res.warning) notice('Removed', res.warning);
                    reload();
                  } catch (x) {
                    notice('Could not remove', errMsg(x));
                  }
                }}
              />
            ) : null}
          </Row>
        ))}
        {others.length ? <Txt variant="small" tone="sub" style={{ marginTop: space.xs }}>Left / removed: {others.map((p: any) => p.name).join(', ')}</Txt> : null}
      </Card>

      {!isAdmin && e.myMembership === 'ACTIVE' ? (
        <Btn
          variant="ghost"
          title="Leave This Event"
          onPress={async () => {
            if (!(await confirm('Leave Event?', 'You can only leave when your balance is fully settled.', 'Leave'))) return;
            try {
              await post(`/events/${e.id}/leave`);
              reload();
            } catch (x) {
              notice('Cannot leave yet', errMsg(x));
            }
          }}
        />
      ) : null}
    </>
  );
}

function Timeline({ eventId }: { eventId: number }) {
  const router = useRouter();
  const t = useTheme();
  const r = useLoad(() => get(`/events/${eventId}/timeline`), [eventId]);

  if (r.loading && !r.data) return <Loading />;
  if (r.error) return <ErrorBox message={r.error} onRetry={r.reload} />;
  const items = r.data.timeline;
  if (!items.length) return <Empty icon="time-outline" title="Nothing recorded on the timeline yet" />;

  return (
    <>
      {items.map((i: any) =>
        i.kind === 'EXPENSE' ? (
          <Card key={`e${i.id}`} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: i.id } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="small" tone="sub">{shortDateTime(i.at)}</Txt>
              <Money paise={i.amountPaise} />
            </Row>
            <Txt variant="h3">{i.title}</Txt>
            <Row>
              <Badge text={i.category} tone="neutral" />
              <Badge text={i.status} />
              {i.visibility === 'PRIVATE' ? <Badge text="Private" tone="action" /> : null}
            </Row>
          </Card>
        ) : (
          <Card key={`t${i.id}`}>
            <Txt variant="small" tone="sub">{shortDateTime(i.at)}</Txt>
            <Txt variant="h3">🚆 {i.fromLocation} → {i.toLocation}</Txt>
            <Row>
              <Badge text={i.transportType} tone="info" />
              <Badge text={i.bookingStatus} />
            </Row>
          </Card>
        )
      )}
    </>
  );
}

function EventExpenses({ eventId, canAdd }: { eventId: number; canAdd: boolean }) {
  const router = useRouter();
  const [mine, setMine] = useState(false);
  const r = useLoad(() => get(`/expenses?eventId=${eventId}&limit=100${mine ? '&mine=true' : ''}`), [eventId, mine]);

  return (
    <>
      {canAdd ? (
        <Btn title="+ Add Expense" variant="primary" icon="add" gradient onPress={() => router.push({ pathname: '/expense/new', params: { eventId } })} />
      ) : null}

      <Chips value={mine ? 'mine' : 'all'} onChange={(v) => setMine(v === 'mine')} options={[{ value: 'all', label: 'All Event Expenses' }, { value: 'mine', label: 'My Expenses' }]} />

      {r.loading && !r.data ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} onRetry={r.reload} />
      ) : r.data.expenses.length === 0 ? (
        <Empty title="No expenses added for this event" hint="Add your first expense to start splitting." />
      ) : (
        r.data.expenses.map((x: any) => (
          <Card key={x.id} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: x.id } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="h3" style={{ flex: 1 }}>{x.title}</Txt>
              <Money paise={x.amountPaise} />
            </Row>
            <Row style={{ flexWrap: 'wrap' }}>
              <Badge text={x.status} />
              {x.visibility === 'PRIVATE' ? <Badge text="Private" tone="action" /> : null}
              {!['INDIVIDUAL', 'GROUP_MEMBER'].includes(x.payerType) ? <Badge text="Sponsored" tone="info" /> : null}
            </Row>
            <Txt variant="small" tone="sub">
              {label(x.category)} • Paid by {x.payerName ?? '—'} • {shortDate(x.spentAt)}
              {x.myApproval ? ` • Your share ${formatINR(x.mySharePaise)} (${label(x.myApproval)})` : ''}
            </Txt>
          </Card>
        ))
      )}
    </>
  );
}

function Travel({ eventId, canAdd }: { eventId: number; canAdd: boolean }) {
  const router = useRouter();
  const r = useLoad(() => get(`/events/${eventId}/travel`), [eventId]);

  return (
    <>
      {canAdd ? (
        <Btn title="+ Add Travel Segment" variant="primary" icon="add" onPress={() => router.push({ pathname: '/travel-new', params: { eventId } })} />
      ) : null}

      {r.loading && !r.data ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} onRetry={r.reload} />
      ) : r.data.segments.length === 0 ? (
        <Empty icon="bus-outline" title="No travel segments added" hint="Add train, bus, flight or cab bookings." />
      ) : (
        r.data.segments.map((s: any) => (
          <Card key={s.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="h3" style={{ flex: 1 }}>{s.fromLocation} → {s.toLocation}</Txt>
              <Badge text={s.bookingStatus} />
            </Row>
            <Row>
              <Badge text={s.transportType} tone="info" />
              {s.ticketAmountPaise ? <Money paise={s.ticketAmountPaise} /> : null}
            </Row>
            <Txt variant="small" tone="sub">{shortDateTime(s.departureAt)} → {shortDateTime(s.arrivalAt)}</Txt>
            <KV k="Vehicle / Flight No" v={s.vehicleDetails} />
            <KV k="Booked By" v={s.bookedByName} />
            <KV k="Paid By" v={s.payerName} />
            <KV k="PNR / Confirmation" v={s.confirmationNumber} />
            <KV k="Notes" v={s.notes} />
            <Txt variant="sub" tone="sub">Passengers: {s.passengers.map((p: any) => p.name).join(', ') || '—'}</Txt>
          </Card>
        ))
      )}
    </>
  );
}

function Settle({ eventId }: { eventId: number }) {
  const { me, isAdmin, refreshUnread } = useAuth();
  const r = useLoad(() => get(`/events/${eventId}/settlement`), [eventId]);
  const s = useLoad(() => get(`/events/${eventId}/summary`), [eventId]);

  const reload = () => {
    r.reload(true);
    s.reload(true);
    refreshUnread();
  };

  if (r.loading && !r.data) return <Loading />;
  if (r.error || !r.data) return <ErrorBox message={r.error ?? 'No settlement data'} onRetry={r.reload} />;

  const d = r.data, f = s.data?.financial;

  const pay = async (t: any) => {
    if (!(await confirm('Record Payment', `Mark ${formatINR(t.amountPaise)} as paid to ${t.toName}? They will receive a notification to confirm.`, 'I Paid'))) return;
    try {
      await post('/settlements', {
        eventId,
        toUserId: t.toUserId,
        amountPaise: t.amountPaise,
        method: 'UPI',
        idempotencyKey: newKey(),
      });
      reload();
    } catch (x) {
      notice('Could not record payment', errMsg(x));
    }
  };

  return (
    <>
      {f ? (
        <Card tone="info">
          <Txt variant="h3">Financial Summary</Txt>
          <KV k="Total Event Spend" v={formatINR(f.totalPaise)} />
          <KV k="College / Sponsor Contribution" v={formatINR(f.sponsoredPaise)} />
          <KV k="Group Shared Spend" v={formatINR(f.groupPaise)} />
          <KV k="Personal Expenses" v={formatINR(f.personalPaise)} />
          <KV k="Awaiting Approval (Pending)" v={formatINR(f.pendingPaise)} />
          <KV k="Outstanding to Settle" v={formatINR(f.outstandingPaise)} />
          <KV k="Settled & Confirmed" v={formatINR(f.settledPaise)} />
        </Card>
      ) : null}

      <Card tone={d.myNetPaise < 0 ? 'danger' : d.myNetPaise > 0 ? 'success' : undefined}>
        <Txt variant="sub" tone="sub">{isAdmin ? 'Net Balances' : 'Your Event Balance'}</Txt>
        {!isAdmin ? <Money paise={d.myNetPaise} signed big /> : null}
        <Txt variant="small" tone="sub">Only approved expense allocations are calculated into balances.</Txt>
      </Card>

      <SectionTitle>Who Owes Whom (Minimal Debts)</SectionTitle>
      {d.suggestions.length === 0 ? (
        <Banner tone="success" text="Everyone is completely settled for this event! 🎉" />
      ) : (
        d.suggestions.map((t: any, idx: number) => (
          <Card key={idx}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="h3" style={{ flex: 1 }}>{t.fromName} → {t.toName}</Txt>
              <Money paise={t.amountPaise} />
            </Row>
            {t.fromUserId === me?.id ? (
              <Btn small title="I Paid This" variant="primary" onPress={() => pay(t)} style={{ alignSelf: 'flex-start', marginTop: space.xs }} />
            ) : null}
          </Card>
        ))
      )}

      <SectionTitle>Individual Net Balances</SectionTitle>
      <Card>
        {d.balances.map((b: any) => (
          <Row key={b.userId} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <Txt style={{ flex: 1, fontWeight: '600' }}>{b.name}{b.userId === me?.id ? ' (you)' : ''}</Txt>
            <Txt variant="small" tone="sub">paid {formatINR(b.paidPaise)} • owes {formatINR(b.owedPaise)}</Txt>
            <Money paise={b.netPaise} signed />
          </Row>
        ))}
      </Card>

      <SectionTitle>Payment History & Settlements</SectionTitle>
      {d.payments.length === 0 ? (
        <Empty title="No payment records" hint="Settlements recorded between participants will appear here." />
      ) : (
        d.payments.map((p: any) => (
          <SettlementCard key={p.id} s={p} meId={me!.id} isAdmin={isAdmin} onChanged={reload} />
        ))
      )}
    </>
  );
}

function Activity({ eventId }: { eventId: number }) {
  const r = useLoad(() => get(`/events/${eventId}/activity?limit=60`), [eventId]);

  if (r.loading && !r.data) return <Loading />;
  if (r.error) return <ErrorBox message={r.error} onRetry={r.reload} />;
  if (!r.data.activity.length) return <Empty title="No activity recorded yet" />;

  return (
    <>
      {r.data.activity.map((a: any) => (
        <Card key={a.id}>
          <Txt variant="h3">{label(a.action)}</Txt>
          <Txt variant="sub" tone="sub">{a.actorName ?? 'System'} • {shortDateTime(a.createdAt)}</Txt>
        </Card>
      ))}
    </>
  );
}
