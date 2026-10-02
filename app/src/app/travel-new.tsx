import React, { useState } from 'react';
import { View } from 'react-native';
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
    if (!f.from.trim() || !f.to.trim()) return setError('From and To locations are required');
    let dep: string | null = null, arr: string | null = null;
    try { dep = toIso(f.dep); arr = toIso(f.arr); } catch { return setError('Use date/time format like 2026-12-01 09:30'); }
    if (dep && arr && arr < dep) return setError('Arrival time cannot be before departure');
    const amt = f.amount.trim() ? parseRupees(f.amount) : 0;
    if (amt == null) return setError('Invalid ticket amount');
    try {
      await post(`/events/${eventId}/travel`, {
        fromLocation: f.from.trim(),
        toLocation: f.to.trim(),
        departureAt: dep,
        arrivalAt: arr,
        transportType: f.mode,
        vehicleDetails: f.vehicle || null,
        payerId: payer,
        ticketAmountPaise: amt,
        bookingStatus: f.status,
        confirmationNumber: f.conf || null,
        notes: f.notes || null,
        passengerIds: pass,
      });
      router.back();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  if (ev.loading && !ev.data) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">New Travel Segment</Txt>
      </Row>
      <Card style={{ gap: 10 }}>
        <Chips label="Transport Mode" value={f.mode} onChange={s('mode')} options={MODES.map((m) => ({ value: m, label: label(m) }))} />
        <Row style={{ gap: 8 }}>
          <View style={{ flex: 1 }}><Field label="From Location" value={f.from} onChangeText={s('from')} placeholder="e.g. Bangalore" /></View>
          <View style={{ flex: 1 }}><Field label="To Location" value={f.to} onChangeText={s('to')} placeholder="e.g. Kochi" /></View>
        </Row>
        <Row style={{ gap: 8 }}>
          <View style={{ flex: 1 }}><Field label="Departure Time" value={f.dep} onChangeText={s('dep')} placeholder="2026-12-01 09:30" /></View>
          <View style={{ flex: 1 }}><Field label="Arrival Time" value={f.arr} onChangeText={s('arr')} placeholder="2026-12-01 14:00" /></View>
        </Row>
        <Field label="Vehicle / Flight / Train details" value={f.vehicle} onChangeText={s('vehicle')} placeholder="e.g. Train 12623 / KA-01-1234" />
        <Field label="Total ticket amount (₹)" value={f.amount} onChangeText={s('amount')} keyboardType="decimal-pad" placeholder="0.00" />
        <Chips label="Booking status" value={f.status} onChange={s('status')} options={['PLANNED', 'BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map((m) => ({ value: m, label: label(m) }))} />
        <Field label="Confirmation / PNR number" value={f.conf} onChangeText={s('conf')} placeholder="e.g. PNR 82349102" />
        <Chips label="Who paid for tickets?" value={payer} onChange={setPayer} options={members.map((m: any) => ({ value: m.id, label: m.name }))} />
        <Chips label="Passengers travelling" multi value={pass} onChange={setPass} options={members.map((m: any) => ({ value: m.id, label: m.name }))} />
        <Field label="Additional notes" value={f.notes} onChangeText={s('notes')} multiline placeholder="Luggage info, seat numbers, etc..." />
        
        {error ? <Banner tone="danger" text={error} /> : null}
        <Row style={{ gap: 8, marginTop: 8 }}>
          <Btn title="Save travel segment" icon="checkmark-outline" onPress={submit} />
          <Btn variant="ghost" title="Cancel" onPress={() => router.back()} />
        </Row>
      </Card>
    </Screen>
  );
}

