import React, { useState } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { get, post } from '@/lib/api';
import { errMsg, useLoad } from '@/lib/hooks';
import { Badge, Banner, Btn, Card, Chips, Field, Row, Screen, SectionTitle, Txt, notice, shortDateTime } from '@/ui/components';
import { label } from '@/ui/theme';

export default function ReportProblem() {
  const router = useRouter();
  const mine = useLoad(() => get('/problems/mine'));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('BUG');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (title.trim().length < 3 || description.trim().length < 5) return setError('Please add a short title and a description');
    try {
      await post('/problems', { title: title.trim(), description: description.trim(), category, deviceInfo: `${Platform.OS} ${Platform.Version}` });
      setTitle(''); setDescription(''); mine.reload(true);
      notice('Thanks!', 'Your report was sent to the admin.');
    } catch (e) { setError(errMsg(e)); }
  };
  return (
    <Screen>
      <Card>
        <Txt variant="h2">Report a problem</Txt>
        <Chips label="Category" value={category} onChange={setCategory} options={['BUG', 'PAYMENT', 'ACCOUNT', 'NOTIFICATION', 'UPLOAD', 'OTHER'].map((c) => ({ value: c, label: label(c) }))} />
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="What happened?" value={description} onChangeText={setDescription} multiline />
        <Txt variant="small">Device info ({Platform.OS}) is attached automatically. Never include passwords.</Txt>
        {error ? <Banner tone="danger" text={error} /> : null}
        <Btn title="Send report" onPress={submit} />
      </Card>
      <SectionTitle>My reports</SectionTitle>
      {(mine.data?.problems ?? []).map((p: any) => (
        <Card key={p.id}><Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{p.title}</Txt><Badge text={p.status} /></Row><Txt variant="small">{shortDateTime(p.createdAt)}</Txt>{p.adminNote ? <Txt variant="sub">Admin: {p.adminNote}</Txt> : null}</Card>
      ))}
    </Screen>
  );
}
