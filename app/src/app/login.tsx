import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/hooks';
import { API_BASE } from '@/lib/api';
import { Banner, Btn, Card, Row, Txt } from '@/ui/components';
import { LogoMark } from '@/ui/shell';
import { radius, space, useTheme } from '@/ui/theme';

export default function Login() {
  const { login } = useAuth();
  const t = useTheme();

  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uFocused, setUFocused] = useState(false);
  const [pFocused, setPFocused] = useState(false);

  const submit = async () => {
    setError(null);
    if (!username.trim() || !password) return setError('Please enter both your username and password');
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const loginForm = (
    <Card style={{ padding: space.xl, gap: space.md, width: '100%', maxWidth: 460 }}>
      <View style={{ gap: space.xs }}>
        <Txt variant="h1" style={{ fontWeight: '800' }}>Welcome back</Txt>
        <Txt variant="sub" tone="sub">Sign in to manage trip expenses & settlements</Txt>
      </View>

      {error ? <Banner text={error} tone="danger" /> : null}

      {/* Username field */}
      <View style={{ gap: 6 }}>
        <Txt variant="sub" style={{ fontWeight: '600', color: uFocused ? t.primary : t.textSub }}>Username</Txt>
        <View style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: t.input,
          borderWidth: 1.5, borderColor: uFocused ? t.primary : t.border,
          borderRadius: radius.md, paddingHorizontal: 14, minHeight: 52, gap: 10,
        }}>
          <Ionicons name="person-outline" size={18} color={uFocused ? t.primary : t.textMuted} />
          <TextInput
            value={username}
            onChangeText={setU}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            placeholder="Enter your username"
            placeholderTextColor={t.textMuted}
            onFocus={() => setUFocused(true)}
            onBlur={() => setUFocused(false)}
            returnKeyType="next"
            style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 12 }}
          />
        </View>
      </View>

      {/* Password field — built without nested Field to avoid double-border bug */}
      <View style={{ gap: 6 }}>
        <Txt variant="sub" style={{ fontWeight: '600', color: pFocused ? t.primary : t.textSub }}>Password</Txt>
        <View style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: t.input,
          borderWidth: 1.5, borderColor: pFocused ? t.primary : t.border,
          borderRadius: radius.md, paddingHorizontal: 14, minHeight: 52, gap: 10,
        }}>
          <Ionicons name="lock-closed-outline" size={18} color={pFocused ? t.primary : t.textMuted} />
          <TextInput
            value={password}
            onChangeText={setP}
            secureTextEntry={!showPassword}
            textContentType="password"
            placeholder="Enter your password"
            placeholderTextColor={t.textMuted}
            onFocus={() => setPFocused(true)}
            onBlur={() => setPFocused(false)}
            onSubmitEditing={submit}
            returnKeyType="done"
            style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 12 }}
          />
          <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={12} style={{ padding: 4 }}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={t.textMuted} />
          </Pressable>
        </View>
      </View>

      <Btn title="Sign In" onPress={submit} loading={loading} gradient fullWidth style={{ marginTop: space.sm }} />

      <View style={{ backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: space.md, marginTop: space.xs }}>
        <Row style={{ gap: space.sm, alignItems: 'flex-start' }}>
          <Ionicons name="information-circle-outline" size={18} color={t.primary} style={{ marginTop: 2 }} />
          <Txt variant="small" tone="sub" style={{ flex: 1 }}>
            Accounts are created by your administrator. There is no public registration.
          </Txt>
        </Row>
      </View>

      <Txt variant="small" tone="muted" style={{ textAlign: 'center', marginTop: space.xs }}>
        Connected to {API_BASE}
      </Txt>
    </Card>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.bg }}>
        <LinearGradient
          colors={t.gradientPrimary as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ flex: 1.2, padding: space.xxl, justifyContent: 'space-between', minWidth: 300 }}
        >
          <LogoMark text={false} size={48} />
          <View style={{ gap: space.md, maxWidth: 500 }}>
            <Txt variant="big" style={{ color: '#FFFFFF', fontWeight: '800', lineHeight: 40 }}>
              Expense Splitting for{'\n'}Hackathons & Trips
            </Txt>
            <Txt style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, lineHeight: 24 }}>
              Track who paid, who benefited, and who owes whom. Integer paise math, zero rounding errors.
            </Txt>
            <View style={{ gap: space.sm, marginTop: space.md }}>
              {[
                'Equal, Custom, Percentage, Shares & Exact splits',
                'Minimal Who-Owes-Whom settlement algorithm',
                'Participant approval workflow & dispute resolution',
              ].map((feat) => (
                <Row key={feat} style={{ gap: space.md }}>
                  <Ionicons name="checkmark-circle" size={20} color="#34D399" />
                  <Txt style={{ color: '#FFFFFF', fontWeight: '600', flex: 1 }}>{feat}</Txt>
                </Row>
              ))}
            </View>
          </View>
          <Txt variant="small" style={{ color: 'rgba(255,255,255,0.7)' }}>Split Calculator v1.1.0</Txt>
        </LinearGradient>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.xxl }}>
          {loginForm}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.lg }}>
        <View style={{ marginBottom: space.xl, alignItems: 'center' }}>
          <LogoMark size={48} />
        </View>
        {loginForm}
      </View>
    </KeyboardAvoidingView>
  );
}
