import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { get, post } from '@/lib/api';
import { errMsg, useLoad } from '@/lib/hooks';
import { Banner, Btn, Card, Chips, Field, Row, Screen, Txt, notice } from '@/ui/components';
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
    if (!eventId) return setError('Please choose an event');
    if (!title.trim()) return setError('Please enter an announcement title');
    try {
      const r = await post('/notifications/broadcast', { eventId, title: title.trim(), body: body.trim() || null, level });
      notice('Sent!', `Broadcast announcement delivered to ${r.sent} event participant(s).`);
      router.back();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">Broadcast Announcement</Txt>
      </Row>

      <Card style={{ gap: 10 }}>
        <Chips label="Target Event" value={eventId} onChange={setEventId} options={(events.data?.events ?? []).map((e: any) => ({ value: e.id, label: e.name }))} />
        <Field label="Announcement Title" value={title} onChangeText={setTitle} placeholder="e.g. Schedule update for Kerala Hackathon" />
        <Field label="Message Body" value={body} onChangeText={setBody} multiline placeholder="Enter detailed announcement message..." />
        <Chips label="Notification Priority" value={level} onChange={setLevel} options={['INFO', 'WARNING', 'ACTION_REQUIRED'].map((l) => ({ value: l, label: label(l) }))} />
        
        {error ? <Banner tone="danger" text={error} /> : null}

        <Row style={{ gap: 8, marginTop: 8 }}>
          <Btn title="Send Announcement" icon="megaphone-outline" onPress={send} />
          <Btn variant="ghost" title="Cancel" onPress={() => router.back()} />
        </Row>
      </Card>
    </Screen>
  );
}
