import React from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { Avatar, Badge, confirm, IconButton, Row, Txt } from './components';
import { radius, space, useTheme } from './theme';

export function LogoMark({ size = 36, text = true }: { size?: number; text?: boolean }) {
  const t = useTheme();
  return (
    <Row style={{ gap: space.md }}>
      <LinearGradient
        colors={t.gradientPrimary as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: size,
          height: size,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          ...t.shadow,
        }}
      >
        <Ionicons name="pie-chart" size={size * 0.55} color="#FFFFFF" />
      </LinearGradient>
      {text && (
        <View>
          <Txt variant="h3" style={{ fontWeight: '800', letterSpacing: -0.3, color: t.text }}>
            Split Calculator
          </Txt>
          <Txt variant="small" tone="sub" style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.5 }}>
            EXPENSE & TRIP MANAGEMENT
          </Txt>
        </View>
      )}
    </Row>
  );
}

export function Sidebar({ currentPath }: { currentPath: string }) {
  const t = useTheme();
  const { me, isAdmin, unread, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    const ok = await confirm('Sign Out', 'Are you sure you want to log out?');
    if (ok) {
      await logout();
      router.replace('/login');
    }
  };

  const userItems = [
    { key: '/', title: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { key: '/trips', title: 'My Trips', icon: 'airplane-outline', activeIcon: 'airplane' },
    { key: '/expenses', title: 'Expenses', icon: 'receipt-outline', activeIcon: 'receipt' },
    { key: '/settlements', title: 'Settle', icon: 'swap-horizontal-outline', activeIcon: 'swap-horizontal' },
    { key: '/notifications', title: 'Notifications', icon: 'notifications-outline', activeIcon: 'notifications', badge: unread > 0 ? unread : null },
    { key: '/profile', title: 'Profile', icon: 'person-outline', activeIcon: 'person' },
    { key: '/report-problem', title: 'Report Problem', icon: 'bug-outline', activeIcon: 'bug' },
  ];

  const adminItems = [
    { key: '/', title: 'Dashboard', icon: 'grid-outline', activeIcon: 'grid' },
    { key: '/trips', title: 'Events', icon: 'calendar-outline', activeIcon: 'calendar' },
    { key: '/expenses', title: 'Expenses', icon: 'receipt-outline', activeIcon: 'receipt' },
    { key: '/settlements', title: 'Settle', icon: 'swap-horizontal-outline', activeIcon: 'swap-horizontal' },
    { key: '/admin/users', title: 'Users Management', icon: 'people-outline', activeIcon: 'people' },
    { key: '/admin/disputes', title: 'Disputes Queue', icon: 'warning-outline', activeIcon: 'warning' },
    { key: '/admin/audit', title: 'Audit Log', icon: 'shield-checkmark-outline', activeIcon: 'shield-checkmark' },
    { key: '/admin/errors', title: 'System Health', icon: 'pulse-outline', activeIcon: 'pulse' },
    { key: '/admin/problems', title: 'Maintenance', icon: 'construct-outline', activeIcon: 'construct' },
    { key: '/admin/broadcast', title: 'Broadcast', icon: 'megaphone-outline', activeIcon: 'megaphone' },
    { key: '/notifications', title: 'Alerts', icon: 'notifications-outline', activeIcon: 'notifications', badge: unread > 0 ? unread : null },
    { key: '/profile', title: 'Profile & Settings', icon: 'settings-outline', activeIcon: 'settings' },
  ];

  const items = isAdmin ? adminItems : userItems;

  return (
    <View
      style={{
        width: 260,
        backgroundColor: t.card,
        borderRightWidth: 1,
        borderColor: t.border,
        height: '100%',
        paddingVertical: space.lg,
        paddingHorizontal: space.md,
        justifyContent: 'space-between',
        flexDirection: 'column',
      }}
    >
      {/* Top Header Logo */}
      <View style={{ paddingHorizontal: space.xs, marginBottom: space.lg }}>
        <LogoMark />
      </View>

      {/* Navigation List */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: space.xs }}>
          <Txt variant="small" tone="sub" style={{ fontWeight: '700', textTransform: 'uppercase', paddingHorizontal: space.xs, marginBottom: space.xs }}>
            {isAdmin ? 'Admin Console' : 'Navigation'}
          </Txt>
          {items.map((item) => {
            const isActive = currentPath === item.key || (item.key !== '/' && currentPath.startsWith(item.key));
            return (
              <Pressable
                key={item.key}
                onPress={() => router.push(item.key as any)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: space.md,
                  paddingVertical: 10,
                  borderRadius: radius.md,
                  backgroundColor: isActive ? t.primaryMuted : pressed ? t.surfaceAlt : 'transparent',
                  borderLeftWidth: isActive ? 4 : 0,
                  borderLeftColor: t.primary,
                })}
              >
                <Row style={{ gap: space.md }}>
                  <Ionicons
                    name={(isActive ? item.activeIcon : item.icon) as any}
                    size={20}
                    color={isActive ? t.primary : t.textSub}
                  />
                  <Txt style={{ fontWeight: isActive ? '700' : '500', color: isActive ? t.primary : t.text }}>
                    {item.title}
                  </Txt>
                </Row>
                {item.badge ? (
                  <View style={{ backgroundColor: t.primary, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Txt variant="small" style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 11 }}>
                      {item.badge}
                    </Txt>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer User Info & Logout Button */}
      <View
        style={{
          borderTopWidth: 1,
          borderColor: t.border,
          paddingTop: space.md,
          marginTop: space.sm,
          gap: space.sm,
        }}
      >
        {me ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Row style={{ gap: space.sm, flex: 1 }}>
              <Avatar name={me.name} avatarAttachmentId={me.avatarAttachmentId} size={36} />
              <View style={{ flex: 1 }}>
                <Txt variant="sub" style={{ fontWeight: '700' }} numberOfLines={1}>
                  {me.name}
                </Txt>
                <Badge text={me.role} tone={me.role === 'ADMIN' ? 'action' : 'info'} />
              </View>
            </Row>
            <IconButton icon="log-out-outline" onPress={handleLogout} tone="danger" size={36} iconSize={18} />
          </Row>
        ) : null}
      </View>
    </View>
  );
}

/** Responsive Layout Shell wrapper */
export function ResponsiveShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const isWide = width >= 900;

  if (!isWide) {
    return <View style={{ flex: 1 }}>{children}</View>;
  }

  return (
    <View style={{ flexDirection: 'row', flex: 1, height: '100%' }}>
      <Sidebar currentPath={pathname} />
      <View style={{ flex: 1, height: '100%' }}>{children}</View>
    </View>
  );
}
