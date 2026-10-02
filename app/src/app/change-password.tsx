import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/hooks';
import { Banner, Btn, Card, Field, Row, Screen, Txt } from '@/ui/components';

export default function ChangePassword() {
  const { setSession, logout, me } = useAuth();
  const router = useRouter();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
      return setError('New password requires at least 8 characters with both letters and numbers');
    }
    if (next !== again) return setError('The new passwords do not match');
    try {
      const r = await post('/auth/change-password', { currentPassword: cur, newPassword: next });
      await setSession(r.token, r.user);
      router.replace('/');
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">{me?.mustChangePassword ? 'Choose Your Password' : 'Change Password'}</Txt>
      </Row>

      <Card style={{ gap: 10 }}>
        {me?.mustChangePassword ? (
          <Banner tone="info" text="Your administrator generated a temporary password for your account. Please choose a new permanent password to continue." />
        ) : null}

        <Field label="Current (or Temporary) Password" value={cur} onChangeText={setCur} secureTextEntry placeholder="Enter current password" />
        <Field label="New Password" value={next} onChangeText={setNext} secureTextEntry placeholder="Enter new password" hint="At least 8 characters, containing letters and digits" />
        <Field label="Re-enter New Password" value={again} onChangeText={setAgain} secureTextEntry placeholder="Confirm new password" />

        {error ? <Banner text={error} tone="danger" /> : null}

        <Row style={{ gap: 8, marginTop: 4 }}>
          <Btn title="Save Password" icon="key-outline" onPress={submit} />
          {!me?.mustChangePassword ? <Btn variant="ghost" title="Cancel" onPress={() => router.back()} /> : null}
        </Row>

        <Btn title="Sign out" variant="ghost" icon="log-out-outline" onPress={logout} style={{ marginTop: 8 }} />
      </Card>
    </Screen>
  );
}

