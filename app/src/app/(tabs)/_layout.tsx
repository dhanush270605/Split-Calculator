import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/ui/theme';

const icon = (name: any, focusedName: any) => ({ color, focused, size }: any) => <Ionicons name={focused ? focusedName : name} color={color} size={size} />;

export default function TabsLayout() {
  const { isAdmin, unread } = useAuth();
  const t = useTheme();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: t.primary, tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border }, headerStyle: { backgroundColor: t.card }, headerTintColor: t.text, sceneStyle: { backgroundColor: t.bg } }}>
      <Tabs.Screen name="index" options={{ title: isAdmin ? 'Dashboard' : 'Home', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="trips" options={{ title: isAdmin ? 'Events' : 'My Trips', tabBarIcon: icon('airplane-outline', 'airplane') }} />
      <Tabs.Screen name="expenses" options={{ title: 'Expenses', tabBarIcon: icon('receipt-outline', 'receipt') }} />
      <Tabs.Screen name="settlements" options={{ title: 'Settle', tabBarIcon: icon('swap-horizontal-outline', 'swap-horizontal') }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts', tabBarIcon: icon('notifications-outline', 'notifications'), tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined }} />
      <Tabs.Screen name="admin" options={{ title: 'Admin', href: isAdmin ? undefined : null, tabBarIcon: icon('shield-outline', 'shield') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
