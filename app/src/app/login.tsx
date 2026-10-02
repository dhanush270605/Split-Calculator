import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/hooks';
import { API_BASE } from '@/lib/api';
import { Banner, Btn, Card, Field, Screen, Txt } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export default function Login() {
  const { login } = useAuth();
  const t = useTheme();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!username.trim() || !password) return setError('Enter your username and password');
    try { await login(username.trim(), password); } catch (e) { setError(errMsg(e)); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', paddingTop: 48, paddingBottom: 16, gap: 6 }}>
          <Txt variant="title" tone="primary">Split Calculator</Txt>
          <Txt variant="sub" style={{ textAlign: 'center' }}>Trips & hackathons, settled fairly.</Txt>
        </View>
        <Card>
          <Txt variant="h2">Sign in</Txt>
          <Field label="Username" value={username} onChangeText={setU} autoCapitalize="none" autoCorrect={false} textContentType="username" />
          <Field label="Password" value={password} onChangeText={setP} secureTextEntry textContentType="password" onSubmitEditing={submit} />
          {error ? <Banner text={error} tone="danger" /> : null}
          <Btn title="Sign in" onPress={submit} />
          <Txt variant="small" style={{ textAlign: 'center' }}>Accounts are created by your admin. There is no public sign-up.</Txt>
        </Card>
        <Txt variant="small" style={{ textAlign: 'center' }}>Server: {API_BASE}</Txt>
      </Screen>
    </KeyboardAvoidingView>
  );
}
