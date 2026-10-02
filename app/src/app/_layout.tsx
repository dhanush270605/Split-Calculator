import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { reportClientError } from '@/lib/api';
import { ThemeProvider, useTheme } from '@/ui/theme';
import { ResponsiveShell } from '@/ui/shell';
import { ToastProvider } from '@/ui/toast';

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
    g.ErrorUtils?.setGlobalHandler?.((e: Error, fatal?: boolean) => {
      reportClientError(e.message, e.stack, 'global');
      prev?.(e, fatal);
    });
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator size="large" color={t.primary} />
      </View>
    );
  }

  const firstSeg = segments[0] as string | undefined;
  const isAuthPage = firstSeg === 'login' || firstSeg === 'change-password';

  const stackContent = (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        contentStyle: { backgroundColor: t.bg },
        headerBackTitle: 'Back',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="change-password" options={{ title: 'Set a New Password', headerBackVisible: false }} />
      <Stack.Screen name="event/[id]" options={{ title: 'Event Details' }} />
      <Stack.Screen name="event/new" options={{ title: 'Create Event' }} />
      <Stack.Screen name="expense/new" options={{ title: 'Add Expense' }} />
      <Stack.Screen name="expense/[id]" options={{ title: 'Expense Details' }} />
      <Stack.Screen name="travel-new" options={{ title: 'Travel Segment' }} />
      <Stack.Screen name="report-problem" options={{ title: 'Report a Problem' }} />
      <Stack.Screen name="admin/users" options={{ title: 'User Management' }} />
      <Stack.Screen name="admin/user-new" options={{ title: 'Create User' }} />
      <Stack.Screen name="admin/user/[id]" options={{ title: 'User Details' }} />
      <Stack.Screen name="admin/audit" options={{ title: 'Activity & Audit Log' }} />
      <Stack.Screen name="admin/errors" options={{ title: 'System Health' }} />
      <Stack.Screen name="admin/problems" options={{ title: 'Maintenance Reports' }} />
      <Stack.Screen name="admin/disputes" options={{ title: 'Disputes Queue' }} />
      <Stack.Screen name="admin/report/[id]" options={{ title: 'Event Financial Report' }} />
      <Stack.Screen name="admin/broadcast" options={{ title: 'Send Announcement' }} />
    </Stack>
  );

  if (isAuthPage || !me) {
    return stackContent;
  }

  return <ResponsiveShell>{stackContent}</ResponsiveShell>;
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="auto" />
            <Gate />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
