import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/hooks';
import { API_BASE } from '@/lib/api';
import { Banner, Btn, Card, Field, Row, Txt } from '@/ui/components';
import { LogoMark } from '@/ui/shell';
import { radius, space, useTheme } from '@/ui/theme';

export default function Login() {
  const { login } = useAuth();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <Card style={{ padding: isWide ? space.xxl : space.xl, gap: space.md, width: '100%', maxWidth: 460 }}>
      <View style={{ gap: space.xs }}>
        <Txt variant="h1" style={{ fontWeight: '800' }}>Welcome back</Txt>
        <Txt variant="sub" tone="sub">Sign in to manage trip expenses & settlements</Txt>
      </View>

      {error ? <Banner text={error} tone="danger" /> : null}

      <Field
        label="Username"
        value={username}
        onChangeText={setU}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="username"
        placeholder="Enter your username"
      />

      <View style={{ gap: 6 }}>
        <Txt variant="sub" style={{ fontWeight: '600' }}>Password</Txt>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: t.input,
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: radius.md,
            paddingHorizontal: 12,
            minHeight: 48,
          }}
        >
          <Field
            label=""
            value={password}
            onChangeText={setP}
            secureTextEntry={!showPassword}
            textContentType="password"
            onSubmitEditing={submit}
            placeholder="Enter your password"
            style={{ flex: 1, borderWidth: 0, paddingHorizontal: 0 }}
          />
          <Pressable onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={t.textSub} />
          </Pressable>
        </View>
      </View>

      <Btn
        title="Sign In"
        onPress={submit}
        loading={loading}
        gradient
        fullWidth
        style={{ marginTop: space.sm }}
      />

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

  if (isWide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.bg }}>
        {/* Left Hero Panel */}
        <LinearGradient
          colors={t.gradientPrimary as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            flex: 1.2,
            padding: space.xxl,
            justifyContent: 'space-between',
          }}
        >
          <LogoMark text={false} size={48} />
          <View style={{ gap: space.md, maxWidth: 500 }}>
            <Txt variant="big" style={{ color: '#FFFFFF', fontWeight: '800', lineHeight: 40 }}>
              Expense Splitting for Hackathons & Trips
            </Txt>
            <Txt style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, lineHeight: 24 }}>
              Track who paid, who benefited, and who owes whom. Server-authoritative integer paise calculations with zero debt rounding errors.
            </Txt>
            <View style={{ gap: space.sm, marginTop: space.md }}>
              <Row style={{ gap: space.md }}>
                <Ionicons name="checkmark-circle" size={20} color="#34D399" />
                <Txt style={{ color: '#FFFFFF', fontWeight: '600' }}>Equal, Custom, Percentage, Shares & Exact splits</Txt>
              </Row>
              <Row style={{ gap: space.md }}>
                <Ionicons name="checkmark-circle" size={20} color="#34D399" />
                <Txt style={{ color: '#FFFFFF', fontWeight: '600' }}>Minimal Who-Owes-Whom settlement algorithm</Txt>
              </Row>
              <Row style={{ gap: space.md }}>
                <Ionicons name="checkmark-circle" size={20} color="#34D399" />
                <Txt style={{ color: '#FFFFFF', fontWeight: '600' }}>Participant approval workflow & dispute resolution</Txt>
              </Row>
            </View>
          </View>
          <Txt variant="small" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Split Calculator v1.1.0 • Built with Expo SDK 57 & React Native
          </Txt>
        </LinearGradient>

        {/* Right Login Form Container */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.xxl }}>
          {loginForm}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.lg }}>
        <View style={{ marginBottom: space.xl, alignItems: 'center' }}>
          <LogoMark size={48} />
        </View>
        {loginForm}
      </View>
    </KeyboardAvoidingView>
  );
}
