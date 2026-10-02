import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { post } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { Banner, Btn, Card, Chips, Field, Screen, Txt } from '@/ui/components';

export default function UserNew() {
  const router = useRouter();
  const [f, setF] = useState({ username: '', name: '', email: '', phone: '', college: '', department: '', year: '', emergencyContact: '', notes: '', role: 'USER', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: number; username: string; temp: string | null } | null>(null);
  const s = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const nn = (v: string) => (v.trim() ? v.trim() : null);
  const submit = async () => {
    setError(null);
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(f.username.trim())) return setError('Username: 3-40 letters, digits, . _ -');
    if (!f.name.trim()) return setError('Name is required');
    try {
      const r = await post('/users', { username: f.username.trim(), name: f.name.trim(), email: nn(f.email), phone: nn(f.phone), college: nn(f.college), department: nn(f.department), year: nn(f.year), emergencyContact: nn(f.emergencyContact), notes: nn(f.notes), role: f.role, password: f.password || undefined });
      setCreated({ id: r.user.id, username: r.user.username, temp: r.temporaryPassword });
    } catch (e) { setError(errMsg(e)); }
  };
  if (created) {
    return (
      <Screen>
        <Card tone="success">
          <Txt variant="h2">User created</Txt>
          <Txt>Username: <Txt style={{ fontWeight: '800' }}>{created.username}</Txt></Txt>
          {created.temp ? <><Txt>Temporary password (shown once):</Txt><Txt variant="h2" selectable>{created.temp}</Txt></> : <Txt variant="sub">They must change the password you set at first sign-in.</Txt>}
          <Btn title="Done" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }
  return (
    <Screen>
      <Card>
        <Txt variant="h2">Create user</Txt>
        <Field label="Username (login ID)" value={f.username} onChangeText={s('username')} autoCapitalize="none" />
        <Field label="Full name" value={f.name} onChangeText={s('name')} />
        <Chips label="Role" value={f.role} onChange={s('role')} options={[{ value: 'USER', label: 'User' }, { value: 'ADMIN', label: 'Admin' }]} />
        <Field label="Email" value={f.email} onChangeText={s('email')} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Phone" value={f.phone} onChangeText={s('phone')} keyboardType="phone-pad" />
        <Field label="College" value={f.college} onChangeText={s('college')} />
        <Field label="Course / department" value={f.department} onChangeText={s('department')} />
        <Field label="Year" value={f.year} onChangeText={s('year')} />
        <Field label="Emergency contact" value={f.emergencyContact} onChangeText={s('emergencyContact')} />
        <Field label="Notes" value={f.notes} onChangeText={s('notes')} multiline />
        <Field label="Initial password (leave empty to auto-generate)" value={f.password} onChangeText={s('password')} secureTextEntry />
        <Txt variant="small">The user must choose a new password at first sign-in.</Txt>
        {error ? <Banner tone="danger" text={error} /> : null}
        <Btn title="Create user" onPress={submit} />
      </Card>
    </Screen>
  );
}
