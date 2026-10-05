import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { API_BASE, get, patch, uploadAttachment } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg, useLoad } from '@/lib/hooks';
import { Avatar, Badge, Banner, Btn, Card, Chips, Field, KV, Row, Screen, SectionTitle, Txt, notice, shortDate } from '@/ui/components';
import { formatINR } from '@/lib/money';
import { label, useThemeCtx } from '@/ui/theme';

export default function Profile() {
  const { me, refreshMe, logout, isAdmin } = useAuth();
  const router = useRouter();
  const { mode, setMode } = useThemeCtx();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ email: '', phone: '', college: '', department: '', year: '', emergencyContact: '' });
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const rep = useLoad(() => get('/reports/me'));

  useEffect(() => {
    if (me) {
      setF({
        email: me.email ?? '',
        phone: me.phone ?? '',
        college: me.college ?? '',
        department: me.department ?? '',
        year: me.year ?? '',
        emergencyContact: me.emergencyContact ?? '',
      });
    }
  }, [me, edit]);

  if (!me) return null;

  const save = async () => {
    setError(null);
    try {
      await patch('/auth/profile', { ...f, email: f.email || null });
      await refreshMe();
      setEdit(false);
      notice('Profile updated', 'Your changes have been saved.');
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const uploadPhoto = async () => {
    const p = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (p.canceled) return;
    const a = p.assets[0];
    try {
      setUploadingAvatar(true);
      await uploadAttachment('PROFILE', me.id, { uri: a.uri, name: a.fileName ?? 'avatar.jpg', mimeType: a.mimeType ?? 'image/jpeg', file: (a as any).file }, 'AVATAR');
      await refreshMe();
      notice('Success', 'Profile avatar updated!');
    } catch (e) {
      notice('Upload failed', errMsg(e));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">My Profile</Txt>
      </Row>

      {/* Hero User Header Card */}
      <Card tone="neutral">
        <Row style={{ gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <View style={{ position: 'relative' }}>
            <Avatar name={me.name} size={64} />
          </View>
          <View style={{ flex: 1 }}>
            <Row style={{ gap: 8, alignItems: 'center' }}>
              <Txt variant="h2">{me.name}</Txt>
              <Badge text={me.role} tone="action" />
            </Row>
            <Txt variant="sub" tone="muted">@{me.username} · {label(me.status)}</Txt>
            <Txt variant="caption" tone="muted">Member since {shortDate(me.createdAt)}</Txt>
          </View>
        </Row>

        <Btn small variant="secondary" icon="camera-outline" title={uploadingAvatar ? 'Uploading...' : 'Change profile photo'} disabled={uploadingAvatar} onPress={uploadPhoto} style={{ alignSelf: 'flex-start', marginBottom: 8 }} />

        {!edit ? (
          <View style={{ gap: 8, marginTop: 4 }}>
            <KV k="Email" v={me.email} />
            <KV k="Phone" v={me.phone} />
            <KV k="College" v={me.college} />
            <KV k="Department" v={me.department} />
            <KV k="Year" v={me.year} />
            <KV k="Emergency Contact" v={me.emergencyContact} />
            <Btn variant="secondary" icon="create-outline" title="Edit details" onPress={() => setEdit(true)} style={{ marginTop: 8 }} />
          </View>
        ) : (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Field label="Email address" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
            <Field label="Phone number" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
            <Field label="College / University" value={f.college} onChangeText={set('college')} />
            <Field label="Department / Stream" value={f.department} onChangeText={set('department')} />
            <Field label="Current Year" value={f.year} onChangeText={set('year')} />
            <Field label="Emergency Contact" value={f.emergencyContact} onChangeText={set('emergencyContact')} />
            <Txt variant="caption" tone="muted">Name and username changes require administrator approval.</Txt>
            {error ? <Banner tone="danger" text={error} /> : null}
            <Row style={{ gap: 8 }}>
              <Btn title="Save Profile" icon="checkmark-outline" onPress={save} />
              <Btn variant="ghost" title="Cancel" onPress={() => setEdit(false)} />
            </Row>
          </View>
        )}
      </Card>

      {/* App Theme Settings */}
      <SectionTitle>Appearance & Theme</SectionTitle>
      <Card>
        <Chips label="Theme Mode" value={mode} onChange={(v) => setMode(v as any)} options={[{ value: 'system', label: '💻 System default' }, { value: 'light', label: '☀️ Light mode' }, { value: 'dark', label: '🌙 Dark mode' }]} />
      </Card>

      {/* User Spending Report */}
      {!isAdmin && rep.data ? (
        <>
          <SectionTitle>Personal Spending Report</SectionTitle>
          <Card>
            <KV k="Group Expenses Paid" v={formatINR(rep.data.paidPaise)} />
            <KV k="Personal Out-of-pocket" v={formatINR(rep.data.personalPaise)} />
            <KV k="Current Owed Amount" v={formatINR(rep.data.owedPaise)} />
            <KV k="Current Receivable Amount" v={formatINR(rep.data.receivablePaise)} />
            <Txt variant="caption" tone="muted" style={{ marginTop: 10, marginBottom: 4 }}>Spending by Category (Confirmed Shares)</Txt>
            <View style={{ gap: 6 }}>
              {rep.data.categories.map((c: any) => (
                <KV key={c.category} k={label(c.category)} v={formatINR(c.totalPaise)} />
              ))}
            </View>
          </Card>
        </>
      ) : null}

      {/* Account Settings & Navigation */}
      <SectionTitle>Account Actions</SectionTitle>
      <Card style={{ gap: 10 }}>
        <Btn variant="secondary" icon="key-outline" title="Change password" onPress={() => router.push('/change-password')} />
        <Btn variant="secondary" icon="bug-outline" title="Report a problem / bug" onPress={() => router.push('/report-problem')} />
        <Btn variant="danger" icon="log-out-outline" title="Sign out of account" onPress={logout} />
      </Card>

      <Txt variant="caption" tone="muted" style={{ textAlign: 'center', marginTop: 12 }}>{__DEV__ ? 'Dev server: ' + API_BASE : ''}</Txt>
    </Screen>
  );
}


