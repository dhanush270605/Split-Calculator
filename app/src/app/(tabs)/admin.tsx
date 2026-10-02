import React from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Row, Screen, Txt } from '@/ui/components';
import { useTheme } from '@/ui/theme';

const ITEMS: { title: string; hint: string; icon: any; path: string }[] = [
  { title: 'Users', hint: 'Create, edit, activate or deactivate accounts', icon: 'people-outline', path: '/admin/users' },
  { title: 'Activity & audit log', hint: 'Every important action, who and when', icon: 'list-outline', path: '/admin/audit' },
  { title: 'Disputes', hint: 'Review and resolve expense disputes', icon: 'alert-circle-outline', path: '/admin/disputes' },
  { title: 'System health & errors', hint: 'Errors, failed operations, DB check', icon: 'pulse-outline', path: '/admin/errors' },
  { title: 'Maintenance reports', hint: 'Problems reported by users', icon: 'construct-outline', path: '/admin/problems' },
  { title: 'Send announcement', hint: 'Message participants of an event', icon: 'megaphone-outline', path: '/admin/broadcast' },
];

export default function AdminHub() {
  const router = useRouter();
  const t = useTheme();
  return (
    <Screen>
      <Txt variant="title">Admin</Txt>
      {ITEMS.map((i) => (
        <Card key={i.path} onPress={() => router.push(i.path as any)}>
          <Row gap={12}><Ionicons name={i.icon} size={26} color={t.primary} /><Row style={{ flex: 1 }}><Txt variant="h3">{i.title}</Txt></Row></Row>
          <Txt variant="sub">{i.hint}</Txt>
        </Card>
      ))}
      <Txt variant="small">Event reports are available from each event's page (Report).</Txt>
    </Screen>
  );
}
