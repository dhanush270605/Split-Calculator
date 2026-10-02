import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/hooks';
import { Banner, Btn, Card, Field, Screen, Txt } from '@/ui/components';

export default function ChangePassword() {
  const { setSession, logout, me } = useAuth();
  const router = useRouter();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) return setError('New password needs 8+ characters with letters and digits');
    if (next !== again) return setError('The new passwords do not match');
    try {
      const r = await post('/auth/change-password', { currentPassword: cur, newPassword: next });
      await setSession(r.token, r.user);
      router.replace('/');
    } catch (e) { setError(errMsg(e)); }
  };
  return (
    <Screen>
      <Card>
        <Txt variant="h2">{me?.mustChangePassword ? 'Choose your own password' : 'Change password'}</Txt>
        {me?.mustChangePassword ? <Txt variant="sub">Your admin gave you a temporary password. Set a new one to continue.</Txt> : null}
        <Field label="Current (temporary) password" value={cur} onChangeText={setCur} secureTextEntry />
        <Field label="New password" value={next} onChangeText={setNext} secureTextEntry hint="At least 8 characters, letters and digits" />
        <Field label="Repeat new password" value={again} onChangeText={setAgain} secureTextEntry />
        {error ? <Banner text={error} tone="danger" /> : null}
        <Btn title="Save password" onPress={submit} />
        <Btn title="Sign out" variant="ghost" onPress={logout} />
      </Card>
    </Screen>
  );
}
