import React, { useState } from 'react';
import { Platform, View } from 'react-native';
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
      setTitle('');
      setDescription('');
      mine.reload(true);
      notice('Thanks!', 'Your report was sent to the system administrator.');
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">Report a Problem</Txt>
      </Row>

      <Card style={{ gap: 10 }}>
        <Chips label="Category" value={category} onChange={setCategory} options={['BUG', 'PAYMENT', 'ACCOUNT', 'NOTIFICATION', 'UPLOAD', 'OTHER'].map((c) => ({ value: c, label: label(c) }))} />
        <Field label="Summary Title" value={title} onChangeText={setTitle} placeholder="Brief summary of the issue..." />
        <Field label="Detailed Description" value={description} onChangeText={setDescription} multiline placeholder="Describe what happened, expected behavior, and steps to reproduce..." />
        <Txt variant="caption" tone="muted">Device metadata ({Platform.OS}) is automatically attached to help diagnose issues.</Txt>
        {error ? <Banner tone="danger" text={error} /> : null}
        <Row style={{ gap: 8, marginTop: 4 }}>
          <Btn title="Submit Report" icon="paper-plane-outline" onPress={submit} />
          <Btn variant="ghost" title="Back" onPress={() => router.back()} />
        </Row>
      </Card>

      <SectionTitle>My Submitted Reports</SectionTitle>
      {(mine.data?.problems ?? []).length === 0 ? (
        <Txt variant="sub" tone="muted">No problem reports submitted yet.</Txt>
      ) : (
        mine.data.problems.map((p: any) => (
          <Card key={p.id} tone={p.status === 'RESOLVED' ? 'success' : undefined}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <Txt variant="h3" style={{ flex: 1, marginRight: 8 }}>{p.title}</Txt>
              <Badge text={p.status} tone={p.status === 'RESOLVED' ? 'success' : 'warn'} />
            </Row>
            <Txt variant="caption" tone="muted">{shortDateTime(p.createdAt)}</Txt>
            <Txt style={{ marginTop: 4 }}>{p.description}</Txt>
            {p.adminNote ? <Txt variant="sub" tone="action" style={{ marginTop: 4 }}>Admin Note: {p.adminNote}</Txt> : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

