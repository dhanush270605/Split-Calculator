import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { get, post } from '@/lib/api';
import { errMsg, useLoad } from '@/lib/hooks';
import { Banner, Btn, Card, Chips, Field, Screen, Txt, notice } from '@/ui/components';
import { label } from '@/ui/theme';

export default function Broadcast() {
  const params = useLocalSearchParams<{ eventId?: string }>();
  const router = useRouter();
  const events = useLoad(() => get('/events?limit=100'));
  const [eventId, setEventId] = useState<number | null>(params.eventId ? Number(params.eventId) : null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [level, setLevel] = useState('INFO');
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setError(null);
    if (!eventId) return setError('Choose an event');
    if (!title.trim()) return setError('Enter a title');
    try { const r = await post('/notifications/broadcast', { eventId, title: title.trim(), body: body.trim() || null, level }); notice('Sent', `Delivered to ${r.sent} participant(s).`); router.back(); } catch (e) { setError(errMsg(e)); }
  };
  return (
    <Screen>
      <Card>
        <Txt variant="h2">Announcement</Txt>
        <Chips label="Event" value={eventId} onChange={setEventId} options={(events.data?.events ?? []).map((e: any) => ({ value: e.id, label: e.name }))} />
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Message" value={body} onChangeText={setBody} multiline />
        <Chips label="Priority" value={level} onChange={setLevel} options={['INFO', 'WARNING', 'ACTION_REQUIRED'].map((l) => ({ value: l, label: label(l) }))} />
        {error ? <Banner tone="danger" text={error} /> : null}
        <Btn title="Send to participants" onPress={send} />
      </Card>
    </Screen>
  );
}
