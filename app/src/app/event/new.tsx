import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { get, patch, post } from '@/lib/api';
import { errMsg, useLoad } from '@/lib/hooks';
import { formatINR, parseRupees } from '@/lib/money';
import { Banner, Btn, Card, Chips, Field, Loading, Row, Screen, SectionTitle, Txt } from '@/ui/components';
import { label } from '@/ui/theme';

const TYPES = ['TRIP', 'HACKATHON', 'HACKATHON_TRIP'];
const STATUSES = ['DRAFT', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED'];
const BUDGET_CATS = ['TRAVEL', 'ACCOMMODATION', 'FOOD', 'HACKATHON', 'OTHER'];
const KINDS = ['TRAVEL', 'HACKATHON', 'TOURISM', 'STAY', 'OTHER'];
const dateOnly = (s?: string) => (s ?? '').slice(0, 10);
const nn = (s: string) => (s.trim() ? s.trim() : null);

export default function EventForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const router = useRouter();
  const users = useLoad(() => get('/users?status=ACTIVE&limit=300'));
  const existing = useLoad(() => (editing ? get(`/events/${id}`) : Promise.resolve(null)), [id]);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<any>({ name: '', type: 'TRIP', description: '', startDate: '', endDate: '', status: 'UPCOMING', destination: '', startLocation: '', organizer: '', college: '', notes: '', visibility: 'PARTICIPANTS', reason: '' });
  const [h, setH] = useState<any>({ hackathonName: '', hostOrg: '', hostCollege: '', venue: '', city: '', state: '', mode: 'OFFLINE', registrationStatus: '', registrationDeadline: '', participationType: '', collegeApproved: 'unknown', teamName: '', teamMembers: '', eventUrl: '', accommodation: '', food: '', transport: '', requiredDocuments: '', notes: '' });
  const [t, setT] = useState<any>({ intermediateLocations: '', returnDestination: '', accommodation: '', food: '', tickets: '', notes: '' });
  const [itin, setItin] = useState<{ day: string; time: string; title: string; kind: string }[]>([]);
  const [budget, setBudget] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(!editing);

  useEffect(() => {
    const e = existing.data?.event;
    if (!e || loaded) return;
    setF({ name: e.name, type: e.type, description: e.description ?? '', startDate: dateOnly(e.startDate), endDate: dateOnly(e.endDate), status: e.status, destination: e.destination ?? '', startLocation: e.startLocation ?? '', organizer: e.organizer ?? '', college: e.college ?? '', notes: e.notes ?? '', visibility: e.visibility, reason: '' });
    if (e.hackathon) setH((p: any) => ({ ...p, ...Object.fromEntries(Object.entries(e.hackathon).filter(([k]) => k in p).map(([k, v]) => [k, v ?? ''])), collegeApproved: e.hackathon.collegeApproved == null ? 'unknown' : e.hackathon.collegeApproved ? 'yes' : 'no', mode: e.hackathon.mode ?? 'OFFLINE' }));
    if (e.trip) setT((p: any) => ({ ...p, ...Object.fromEntries(Object.entries(e.trip).filter(([k]) => k in p).map(([k, v]) => [k, v ?? ''])) }));
    setItin(e.itinerary.map((i: any) => ({ day: String(i.day), time: i.time ?? '', title: i.title, kind: i.kind })));
    setBudget(Object.fromEntries(e.budget.filter((b: any) => b.budgetPaise).map((b: any) => [b.category, (b.budgetPaise / 100).toFixed(2)])));
    setLoaded(true);
  }, [existing.data, loaded]);

  const sf = (k: string) => (v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const sh = (k: string) => (v: any) => setH((s: any) => ({ ...s, [k]: v }));
  const st = (k: string) => (v: any) => setT((s: any) => ({ ...s, [k]: v }));
  const showH = f.type !== 'TRIP', showT = f.type !== 'HACKATHON';

  const submit = async () => {
    setError(null);
    if (!f.name.trim()) return setError('Event name is required');
    if (!/^\d{4}-\d{2}-\d{2}/.test(f.startDate) || !/^\d{4}-\d{2}-\d{2}/.test(f.endDate)) return setError('Dates must look like 2026-12-31');
    if (f.endDate < f.startDate) return setError('End date must be on or after the start date');
    const budgets: Record<string, number> = {};
    for (const [k, v] of Object.entries(budget)) { if (!v.trim()) continue; const p = parseRupees(v); if (p == null) return setError(`Invalid budget amount for ${label(k)}`); budgets[k] = p; }
    const itinerary = itin.filter((i) => i.title.trim()).map((i) => ({ day: Number(i.day) || 1, time: nn(i.time), title: i.title.trim(), kind: i.kind }));
    const hackathon = showH ? Object.fromEntries(Object.entries(h).filter(([k]) => k !== 'collegeApproved').map(([k, v]) => [k, nn(String(v))])) : undefined;
    if (hackathon) (hackathon as any).collegeApproved = h.collegeApproved === 'unknown' ? null : h.collegeApproved === 'yes';
    const trip = showT ? Object.fromEntries(Object.entries(t).map(([k, v]) => [k, nn(String(v))])) : undefined;
    const body: any = {
      name: f.name.trim(), type: f.type, description: nn(f.description), startDate: f.startDate, endDate: f.endDate, status: f.status, destination: nn(f.destination), startLocation: nn(f.startLocation),
      organizer: nn(f.organizer), college: nn(f.college), notes: nn(f.notes), visibility: f.visibility, hackathon, trip, itinerary, budgets,
    };
    try {
      if (editing) { await patch(`/events/${id}`, { ...body, reason: nn(f.reason) ?? undefined }); router.back(); }
      else { const r = await post('/events', { ...body, participantIds: people }); router.replace({ pathname: '/event/[id]', params: { id: r.event.id } }); }
    } catch (e) { setError(errMsg(e)); }
  };

  if (editing && !loaded) return <Screen><Loading /></Screen>;
  return (
    <Screen>
      <Card>
        <Txt variant="h2">{editing ? 'Edit event' : 'Create event'}</Txt>
        <Chips label="Type" value={f.type} onChange={sf('type')} options={TYPES.map((x) => ({ value: x, label: x === 'HACKATHON_TRIP' ? 'Hackathon + Trip' : label(x) }))} />
        <Field label="Event name" value={f.name} onChangeText={sf('name')} />
        <Field label="Description" value={f.description} onChangeText={sf('description')} multiline />
        <Row><Field label="Start date" value={f.startDate} onChangeText={sf('startDate')} placeholder="2026-12-01" /><Field label="End date" value={f.endDate} onChangeText={sf('endDate')} placeholder="2026-12-05" /></Row>
        <Chips label="Status" value={f.status} onChange={sf('status')} options={STATUSES.map((x) => ({ value: x, label: label(x) }))} />
        <Field label="Starting location" value={f.startLocation} onChangeText={sf('startLocation')} />
        <Field label="Destination" value={f.destination} onChangeText={sf('destination')} />
        <Field label="Organizer" value={f.organizer} onChangeText={sf('organizer')} />
        <Field label="College" value={f.college} onChangeText={sf('college')} />
        <Field label="Notes" value={f.notes} onChangeText={sf('notes')} multiline />
        <Chips label="Visibility" value={f.visibility} onChange={sf('visibility')} options={[{ value: 'PARTICIPANTS', label: 'Participants' }, { value: 'ADMIN_ONLY', label: 'Admin only' }]} />
        {editing ? <Field label="Reason for change (shown in audit log)" value={f.reason} onChangeText={sf('reason')} /> : null}
      </Card>
      {showH ? (
        <Card>
          <Txt variant="h3">Hackathon details</Txt>
          <Field label="Hackathon name" value={h.hackathonName} onChangeText={sh('hackathonName')} />
          <Field label="Host organization" value={h.hostOrg} onChangeText={sh('hostOrg')} />
          <Field label="Host college" value={h.hostCollege} onChangeText={sh('hostCollege')} />
          <Field label="Venue" value={h.venue} onChangeText={sh('venue')} />
          <Row><Field label="City" value={h.city} onChangeText={sh('city')} /><Field label="State" value={h.state} onChangeText={sh('state')} /></Row>
          <Chips label="Mode" value={h.mode} onChange={sh('mode')} options={['ONLINE', 'OFFLINE', 'HYBRID'].map((x) => ({ value: x, label: label(x) }))} />
          <Field label="Registration status" value={h.registrationStatus} onChangeText={sh('registrationStatus')} />
          <Field label="Registration deadline" value={h.registrationDeadline} onChangeText={sh('registrationDeadline')} placeholder="2026-12-01" />
          <Field label="Participation type" value={h.participationType} onChangeText={sh('participationType')} placeholder="Team / Individual" />
          <Chips label="College approved?" value={h.collegeApproved} onChange={sh('collegeApproved')} options={[{ value: 'unknown', label: 'Unknown' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
          <Field label="Team name" value={h.teamName} onChangeText={sh('teamName')} />
          <Field label="Team members" value={h.teamMembers} onChangeText={sh('teamMembers')} />
          <Field label="Required documents" value={h.requiredDocuments} onChangeText={sh('requiredDocuments')} />
          <Field label="Accommodation" value={h.accommodation} onChangeText={sh('accommodation')} />
          <Field label="Food" value={h.food} onChangeText={sh('food')} />
          <Field label="Transport" value={h.transport} onChangeText={sh('transport')} />
          <Field label="Event URL" value={h.eventUrl} onChangeText={sh('eventUrl')} autoCapitalize="none" />
        </Card>
      ) : null}
      {showT ? (
        <Card>
          <Txt variant="h3">Trip details</Txt>
          <Field label="Intermediate locations" value={t.intermediateLocations} onChangeText={st('intermediateLocations')} />
          <Field label="Return destination" value={t.returnDestination} onChangeText={st('returnDestination')} />
          <Field label="Accommodation" value={t.accommodation} onChangeText={st('accommodation')} />
          <Field label="Food" value={t.food} onChangeText={st('food')} />
          <Field label="Tickets" value={t.tickets} onChangeText={st('tickets')} />
          <Field label="Notes" value={t.notes} onChangeText={st('notes')} />
        </Card>
      ) : null}
      <SectionTitle action={<Btn small variant="secondary" title="Add item" onPress={() => setItin((i) => [...i, { day: String((i.at(-1) ? Number(i.at(-1)!.day) : 1)), time: '', title: '', kind: 'OTHER' }])} />}>Itinerary</SectionTitle>
      {itin.map((it, idx) => (
        <Card key={idx}>
          <Row><Field label="Day" value={it.day} onChangeText={(v) => setItin((l) => l.map((x, i) => (i === idx ? { ...x, day: v } : x)))} keyboardType="number-pad" /><Field label="Time" value={it.time} onChangeText={(v) => setItin((l) => l.map((x, i) => (i === idx ? { ...x, time: v } : x)))} placeholder="09:00" /></Row>
          <Field label="Title" value={it.title} onChangeText={(v) => setItin((l) => l.map((x, i) => (i === idx ? { ...x, title: v } : x)))} />
          <Chips value={it.kind} onChange={(v) => setItin((l) => l.map((x, i) => (i === idx ? { ...x, kind: v } : x)))} options={KINDS.map((k) => ({ value: k, label: label(k) }))} />
          <Btn small variant="ghost" title="Remove" onPress={() => setItin((l) => l.filter((_, i) => i !== idx))} />
        </Card>
      ))}
      <SectionTitle>Budget (₹, optional)</SectionTitle>
      <Card>{BUDGET_CATS.map((c) => <Field key={c} label={label(c)} value={budget[c] ?? ''} onChangeText={(v) => setBudget((b) => ({ ...b, [c]: v }))} keyboardType="decimal-pad" />)}</Card>
      {!editing ? (
        <>
          <SectionTitle>Participants</SectionTitle>
          <Card>
            {users.loading ? <Loading /> : <Chips multi value={people} onChange={setPeople} options={(users.data?.users ?? []).filter((u: any) => u.role === 'USER').map((u: any) => ({ value: u.id, label: u.name }))} />}
            <Txt variant="small">{people.length} selected. Only registered users can be added.</Txt>
          </Card>
        </>
      ) : <Txt variant="small">Manage participants from the event page.</Txt>}
      {error ? <Banner tone="danger" text={error} /> : null}
      <Btn title={editing ? 'Save changes' : 'Create event'} onPress={submit} />
    </Screen>
  );
}
