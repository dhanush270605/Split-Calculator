import React from 'react';
import { useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/ui/theme';

const renderIcon = (name: any, focusedName: any) => ({ color, focused, size }: any) => (
  <Ionicons name={focused ? focusedName : name} color={color} size={size} />
);

export default function TabsLayout() {
  const { isAdmin, unread } = useAuth();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWide = width >= 900;

  const TAB_HEIGHT = 56 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: {
          backgroundColor: t.card,
          borderTopColor: t.border,
          borderTopWidth: 1,
          display: isWide ? 'none' : 'flex',
          height: TAB_HEIGHT,
          paddingBottom: insets.bottom + 4,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 0,
        },
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: isAdmin ? 'Dashboard' : 'Home',
          tabBarIcon: renderIcon('home-outline', 'home'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: isAdmin ? 'Events' : 'Trips',
          tabBarIcon: renderIcon('airplane-outline', 'airplane'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Expenses',
          tabBarIcon: renderIcon('receipt-outline', 'receipt'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="settlements"
        options={{
          title: 'Settle',
          tabBarIcon: renderIcon('swap-horizontal-outline', 'swap-horizontal'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: renderIcon('notifications-outline', 'notifications'),
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          href: isAdmin ? undefined : null,
          tabBarIcon: renderIcon('shield-outline', 'shield'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: renderIcon('person-outline', 'person'),
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
