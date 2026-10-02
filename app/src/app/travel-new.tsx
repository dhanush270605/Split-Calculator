import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { get, post } from '@/lib/api';
import { errMsg, useLoad } from '@/lib/hooks';
import { parseRupees } from '@/lib/money';
import { Banner, Btn, Card, Chips, Field, Loading, Row, Screen, Txt } from '@/ui/components';
import { label } from '@/ui/theme';

const MODES = ['BUS', 'TRAIN', 'FLIGHT', 'TAXI', 'CAB', 'AUTO', 'RICKSHAW', 'CAR', 'BIKE', 'RENTAL', 'METRO', 'OTHER'];
const toIso = (s: string) => (s.trim() ? new Date(s.trim().replace(' ', 'T')).toISOString() : null);

export default function TravelNew() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const ev = useLoad(() => get(`/events/${eventId}`), [eventId]);
  const [f, setF] = useState({ from: '', to: '', dep: '', arr: '', mode: 'BUS', vehicle: '', amount: '', status: 'PLANNED', conf: '', notes: '' });
  const [payer, setPayer] = useState<number | null>(null);
  const [pass, setPass] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const s = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const members = (ev.data?.event.participants ?? []).filter((p: any) => p.status === 'ACTIVE');

  const submit = async () => {
    setError(null);
    if (!f.from.trim() || !f.to.trim()) return setError('From and To are required');
    let dep: string | null = null, arr: string | null = null;
    try { dep = toIso(f.dep); arr = toIso(f.arr); } catch { return setError('Use date/time like 2026-12-01 09:30'); }
    if (dep && arr && arr < dep) return setError('Arrival must not be before departure');
    const amt = f.amount.trim() ? parseRupees(f.amount) : 0;
    if (amt == null) return setError('Invalid ticket amount');
    try {
      await post(`/events/${eventId}/travel`, { fromLocation: f.from.trim(), toLocation: f.to.trim(), departureAt: dep, arrivalAt: arr, transportType: f.mode, vehicleDetails: f.vehicle || null, payerId: payer, ticketAmountPaise: amt, bookingStatus: f.status, confirmationNumber: f.conf || null, notes: f.notes || null, passengerIds: pass });
      router.back();
    } catch (e) { setError(errMsg(e)); }
  };
  if (ev.loading && !ev.data) return <Screen><Loading /></Screen>;
  return (
    <Screen>
      <Card>
        <Txt variant="h2">New travel segment</Txt>
        <Chips label="Transport" value={f.mode} onChange={s('mode')} options={MODES.map((m) => ({ value: m, label: label(m) }))} />
        <Row><Field label="From" value={f.from} onChangeText={s('from')} /><Field label="To" value={f.to} onChangeText={s('to')} /></Row>
        <Field label="Departure" value={f.dep} onChangeText={s('dep')} placeholder="2026-12-01 09:30" />
        <Field label="Arrival" value={f.arr} onChangeText={s('arr')} placeholder="2026-12-01 14:00" />
        <Field label="Vehicle details" value={f.vehicle} onChangeText={s('vehicle')} placeholder="Train 12623 / KA-01-1234" />
        <Field label="Ticket amount (₹)" value={f.amount} onChangeText={s('amount')} keyboardType="decimal-pad" />
        <Chips label="Booking status" value={f.status} onChange={s('status')} options={['PLANNED', 'BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map((m) => ({ value: m, label: label(m) }))} />
        <Field label="Confirmation number" value={f.conf} onChangeText={s('conf')} />
        <Chips label="Who paid?" value={payer} onChange={setPayer} options={members.map((m: any) => ({ value: m.id, label: m.name }))} />
        <Chips label="Passengers" multi value={pass} onChange={setPass} options={members.map((m: any) => ({ value: m.id, label: m.name }))} />
        <Field label="Notes" value={f.notes} onChangeText={s('notes')} multiline />
        <Txt variant="small">You are recorded as the booking person. Create an expense to split the ticket cost.</Txt>
        {error ? <Banner tone="danger" text={error} /> : null}
        <Btn title="Save segment" onPress={submit} />
      </Card>
    </Screen>
  );
}
