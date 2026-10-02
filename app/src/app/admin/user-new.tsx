import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { post } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { Banner, Btn, Card, Chips, Field, Row, Screen, Txt } from '@/ui/components';

export default function UserNew() {
  const router = useRouter();
  const [f, setF] = useState({ username: '', name: '', email: '', phone: '', college: '', department: '', year: '', emergencyContact: '', notes: '', role: 'USER', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: number; username: string; temp: string | null } | null>(null);

  const s = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const nn = (v: string) => (v.trim() ? v.trim() : null);

  const submit = async () => {
    setError(null);
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(f.username.trim())) return setError('Username must be 3-40 characters (letters, digits, ., _, -)');
    if (!f.name.trim()) return setError('Full name is required');
    try {
      const r = await post('/users', {
        username: f.username.trim(),
        name: f.name.trim(),
        email: nn(f.email),
        phone: nn(f.phone),
        college: nn(f.college),
        department: nn(f.department),
        year: nn(f.year),
        emergencyContact: nn(f.emergencyContact),
        notes: nn(f.notes),
        role: f.role,
        password: f.password || undefined,
      });
      setCreated({ id: r.user.id, username: r.user.username, temp: r.temporaryPassword });
    } catch (e) {
      setError(errMsg(e));
    }
  };

  if (created) {
    return (
      <Screen>
        <Card tone="success" style={{ gap: 12 }}>
          <Txt variant="h2">User Created Successfully</Txt>
          <Txt>Login Username: <Txt style={{ fontWeight: '800' }}>{created.username}</Txt></Txt>
          {created.temp ? (
            <View style={{ gap: 4, padding: 12, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 10 }}>
              <Txt variant="sub">Temporary Password (shown once):</Txt>
              <Txt variant="h1" selectable style={{ color: '#047857' }}>{created.temp}</Txt>
            </View>
          ) : (
            <Txt variant="sub">The user must change the password on their first sign-in.</Txt>
          )}
          <Btn title="Done & return to directory" icon="checkmark-outline" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">Create New Account</Txt>
      </Row>

      <Card style={{ gap: 10 }}>
        <Field label="Username (Login ID)" value={f.username} onChangeText={s('username')} autoCapitalize="none" placeholder="e.g. aarav.sharma" />
        <Field label="Full Name" value={f.name} onChangeText={s('name')} placeholder="e.g. Aarav Sharma" />
        <Chips label="User Role" value={f.role} onChange={s('role')} options={[{ value: 'USER', label: 'User / Participant' }, { value: 'ADMIN', label: 'Administrator' }]} />
        
        <Row style={{ gap: 8 }}>
          <View style={{ flex: 1 }}><Field label="Email Address" value={f.email} onChangeText={s('email')} autoCapitalize="none" keyboardType="email-address" placeholder="email@domain.com" /></View>
          <View style={{ flex: 1 }}><Field label="Phone Number" value={f.phone} onChangeText={s('phone')} keyboardType="phone-pad" placeholder="+91 98765 43210" /></View>
        </Row>

        <Field label="College / Institution" value={f.college} onChangeText={s('college')} placeholder="e.g. IIT Madras" />
        <Row style={{ gap: 8 }}>
          <View style={{ flex: 1 }}><Field label="Department / Stream" value={f.department} onChangeText={s('department')} placeholder="Computer Science" /></View>
          <View style={{ flex: 1 }}><Field label="Year" value={f.year} onChangeText={s('year')} placeholder="3rd Year" /></View>
        </Row>

        <Field label="Emergency Contact" value={f.emergencyContact} onChangeText={s('emergencyContact')} placeholder="Contact name & phone" />
        <Field label="Admin Notes" value={f.notes} onChangeText={s('notes')} multiline placeholder="Internal notes..." />
        <Field label="Initial Password (leave blank to auto-generate)" value={f.password} onChangeText={s('password')} secureTextEntry placeholder="Auto-generated if empty" />
        
        <Txt variant="caption" tone="muted">New users are forced to change temporary passwords upon first sign-in.</Txt>
        {error ? <Banner tone="danger" text={error} /> : null}

        <Row style={{ gap: 8, marginTop: 8 }}>
          <Btn title="Create User Account" icon="person-add-outline" onPress={submit} />
          <Btn variant="ghost" title="Cancel" onPress={() => router.back()} />
        </Row>
      </Card>
    </Screen>
  );
}

