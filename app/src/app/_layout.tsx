import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { reportClientError } from '@/lib/api';
import { useTheme } from '@/ui/theme';
import { Btn, Card, Txt } from '@/ui/components';

export { ErrorBoundary } from '@/lib/error-boundary';

function Gate() {
  const { me, ready } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const t = useTheme();
  useEffect(() => {
    if (!ready) return;
    const first = segments[0] as string | undefined;
    if (!me && first !== 'login') router.replace('/login');
    else if (me?.mustChangePassword && first !== 'change-password') router.replace('/change-password');
    else if (me && !me.mustChangePassword && (first === 'login' || first === 'change-password')) router.replace('/');
  }, [me, ready, segments]);

  useEffect(() => {
    const g: any = globalThis;
    const prev = g.ErrorUtils?.getGlobalHandler?.();
    g.ErrorUtils?.setGlobalHandler?.((e: Error, fatal?: boolean) => { reportClientError(e.message, e.stack, 'global'); prev?.(e, fatal); });
  }, []);

  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.bg }}><ActivityIndicator size="large" /></View>;
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: t.card }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg }, headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="change-password" options={{ title: 'Set a new password', headerBackVisible: false }} />
      <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
      <Stack.Screen name="event/new" options={{ title: 'Event' }} />
      <Stack.Screen name="expense/new" options={{ title: 'New expense' }} />
      <Stack.Screen name="expense/[id]" options={{ title: 'Expense' }} />
      <Stack.Screen name="travel-new" options={{ title: 'Travel segment' }} />
      <Stack.Screen name="report-problem" options={{ title: 'Report a problem' }} />
      <Stack.Screen name="admin/users" options={{ title: 'Users' }} />
      <Stack.Screen name="admin/user-new" options={{ title: 'User' }} />
      <Stack.Screen name="admin/user/[id]" options={{ title: 'User' }} />
      <Stack.Screen name="admin/audit" options={{ title: 'Activity & audit log' }} />
      <Stack.Screen name="admin/errors" options={{ title: 'System health' }} />
      <Stack.Screen name="admin/problems" options={{ title: 'Maintenance reports' }} />
      <Stack.Screen name="admin/disputes" options={{ title: 'Disputes' }} />
      <Stack.Screen name="admin/report/[id]" options={{ title: 'Event report' }} />
      <Stack.Screen name="admin/broadcast" options={{ title: 'Send announcement' }} />
    </Stack>
  );
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

