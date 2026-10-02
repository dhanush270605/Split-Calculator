import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { get, patch, post } from '@/lib/api';
import { errMsg, useLoad } from '@/lib/hooks';
import { formatINR } from '@/lib/money';
import { Avatar, Badge, Banner, Btn, Card, Chips, ErrorBox, Field, KV, Loading, Money, Row, Screen, SectionTitle, Txt, confirm, notice, shortDateTime } from '@/ui/components';
import { label } from '@/ui/theme';

export default function UserDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const r = useLoad(() => get(`/users/${id}/activity`), [id]);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<any>({});
  const [temp, setTemp] = useState<string | null>(null);

  if (r.loading && !r.data) return <Screen><Loading /></Screen>;
  if (r.error || !r.data) return <Screen><ErrorBox message={r.error ?? 'User not found'} onRetry={r.reload} /></Screen>;

  const u = r.data.user;

  const run = async (fn: () => Promise<any>) => {
    try {
      await fn();
      await r.reload(true);
    } catch (e) {
      notice('Could not update user', errMsg(e));
    }
  };

  const startEdit = () => {
    setF({
      name: u.name,
      email: u.email ?? '',
      phone: u.phone ?? '',
      college: u.college ?? '',
      department: u.department ?? '',
      year: u.year ?? '',
      emergencyContact: u.emergencyContact ?? '',
      notes: u.notes ?? '',
      role: u.role,
    });
    setEdit(true);
  };

  const nn = (v: string) => (v?.trim() ? v.trim() : null);

  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Card tone="neutral">
        <Row style={{ gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <Avatar name={u.name} userId={u.id} size={56} />
          <View style={{ flex: 1 }}>
            <Row style={{ gap: 8, alignItems: 'center' }}>
              <Txt variant="h2">{u.name}</Txt>
              <Badge text={u.role} tone={u.role === 'ADMIN' ? 'action' : 'neutral'} />
            </Row>
            <Txt variant="sub" tone="muted">@{u.username} · {label(u.status)}</Txt>
          </View>
          <Badge text={u.status} tone={u.status === 'ACTIVE' ? 'success' : u.status === 'INACTIVE' ? 'warn' : 'danger'} />
        </Row>

        {!edit ? (
          <View style={{ gap: 8 }}>
            <KV k="Email" v={u.email} />
            <KV k="Phone" v={u.phone} />
            <KV k="College" v={u.college} />
            <KV k="Department" v={u.department} />
            <KV k="Year" v={u.year} />
            <KV k="Emergency Contact" v={u.emergencyContact} />
            <KV k="Admin Notes" v={u.notes} />
            
            <Row style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <Btn small variant="secondary" icon="create-outline" title="Edit details" onPress={startEdit} />
              {u.status === 'ACTIVE' ? (
                <Btn small variant="danger" title="Deactivate user" onPress={async () => {
                  if (await confirm('Deactivate user?', 'They are signed out immediately. Financial records are preserved.', 'Deactivate')) {
                    run(() => post(`/users/${u.id}/status`, { status: 'INACTIVE' }));
                  }
                }} />
              ) : (
                <Btn small title="Activate user" onPress={() => run(() => post(`/users/${u.id}/status`, { status: 'ACTIVE' }))} />
              )}
              {u.status !== 'ARCHIVED' ? (
                <Btn small variant="ghost" title="Archive" onPress={async () => {
                  if (await confirm('Archive user?', 'Archived users cannot sign in and are hidden from user selection.')) {
                    run(() => post(`/users/${u.id}/status`, { status: 'ARCHIVED' }));
                  }
                }} />
              ) : null}
              <Btn small variant="secondary" icon="key-outline" title="Reset password" onPress={async () => {
                if (await confirm('Reset password?', 'A new temporary password will be generated and shown once.')) {
                  run(async () => { setTemp((await post(`/users/${u.id}/reset-password`)).temporaryPassword); });
                }
              }} />
            </Row>
            {temp ? <Banner tone="success" text={`Temporary password (shown once): ${temp}`} /> : null}
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {['name', 'email', 'phone', 'college', 'department', 'year', 'emergencyContact', 'notes'].map((k) => (
              <Field key={k} label={label(k.replace(/([A-Z])/g, ' $1'))} value={f[k]} onChangeText={(v) => setF((x: any) => ({ ...x, [k]: v }))} />
            ))}
            <Chips label="User Role" value={f.role} onChange={(v) => setF((x: any) => ({ ...x, role: v }))} options={[{ value: 'USER', label: 'User' }, { value: 'ADMIN', label: 'Admin' }]} />
            <Row style={{ gap: 8, marginTop: 8 }}>
              <Btn title="Save changes" icon="checkmark-outline" onPress={() => run(async () => {
                await patch(`/users/${u.id}`, { name: f.name.trim(), email: nn(f.email), phone: nn(f.phone), college: nn(f.college), department: nn(f.department), year: nn(f.year), emergencyContact: nn(f.emergencyContact), notes: nn(f.notes), role: f.role });
                setEdit(false);
              })} />
              <Btn variant="ghost" title="Cancel" onPress={() => setEdit(false)} />
            </Row>
          </View>
        )}
      </Card>

      <SectionTitle>Event Memberships ({r.data.events.length})</SectionTitle>
      {r.data.events.map((e: any) => (
        <Card key={e.id} onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt variant="h3" style={{ flex: 1 }}>{e.name}</Txt>
            <Badge text={e.membership} tone="action" />
          </Row>
        </Card>
      ))}

      <SectionTitle>Recent Expenses ({r.data.expenses.length})</SectionTitle>
      {r.data.expenses.slice(0, 10).map((e: any) => (
        <Card key={e.id} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt style={{ flex: 1, fontWeight: '600' }}>{e.title}</Txt>
            <Money paise={e.amountPaise} />
          </Row>
          <Row style={{ gap: 6, marginTop: 4 }}>
            <Badge text={e.status} />
            {e.visibility === 'PRIVATE' ? <Badge text="Private" tone="action" /> : null}
          </Row>
        </Card>
      ))}

      <SectionTitle>Settlements ({r.data.settlements.length})</SectionTitle>
      {r.data.settlements.map((s: any) => (
        <Card key={s.id}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Money paise={s.amountPaise} />
            <Badge text={s.status} tone={s.status === 'CONFIRMED' ? 'success' : 'warn'} />
          </Row>
        </Card>
      ))}

      <SectionTitle>Activity Log</SectionTitle>
      <Card>
        <View style={{ gap: 8 }}>
          {r.data.activity.slice(0, 25).map((a: any) => (
            <KV key={a.id} k={shortDateTime(a.createdAt)} v={label(a.action)} />
          ))}
        </View>
      </Card>
    </Screen>
  );
}
