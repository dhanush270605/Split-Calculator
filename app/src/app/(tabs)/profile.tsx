import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { patch, get, API_BASE } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg, useLoad } from '@/lib/hooks';
import { Banner, Btn, Card, Field, KV, Row, Screen, SectionTitle, Txt, notice, shortDate } from '@/ui/components';
import { Badge } from '@/ui/components';
import { formatINR } from '@/lib/money';
import { label } from '@/ui/theme';

export default function Profile() {
  const { me, refreshMe, logout, isAdmin } = useAuth();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ email: '', phone: '', college: '', department: '', year: '', emergencyContact: '' });
  const [error, setError] = useState<string | null>(null);
  const rep = useLoad(() => get('/reports/me'));
  useEffect(() => { if (me) setF({ email: me.email ?? '', phone: me.phone ?? '', college: me.college ?? '', department: me.department ?? '', year: me.year ?? '', emergencyContact: me.emergencyContact ?? '' }); }, [me, edit]);
  if (!me) return null;
  const save = async () => {
    setError(null);
    try { await patch('/auth/profile', { ...f, email: f.email || null }); await refreshMe(); setEdit(false); } catch (e) { setError(errMsg(e)); }
  };
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Screen>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}><Txt variant="h2">{me.name}</Txt><Badge text={me.role} tone="action" /></Row>
        <Txt variant="sub">@{me.username} · {label(me.status)} · joined {shortDate(me.createdAt)}</Txt>
        {!edit ? (
          <>
            <KV k="Email" v={me.email} /><KV k="Phone" v={me.phone} /><KV k="College" v={me.college} /><KV k="Department" v={me.department} /><KV k="Year" v={me.year} /><KV k="Emergency contact" v={me.emergencyContact} />
            <Btn variant="secondary" title="Edit profile" onPress={() => setEdit(true)} />
          </>
        ) : (
          <>
            <Field label="Email" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
            <Field label="Phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
            <Field label="College" value={f.college} onChangeText={set('college')} />
            <Field label="Department" value={f.department} onChangeText={set('department')} />
            <Field label="Year" value={f.year} onChangeText={set('year')} />
            <Field label="Emergency contact" value={f.emergencyContact} onChangeText={set('emergencyContact')} />
            <Txt variant="small">Name and username are managed by your admin.</Txt>
            {error ? <Banner tone="danger" text={error} /> : null}
            <Row><Btn title="Save" onPress={save} /><Btn variant="ghost" title="Cancel" onPress={() => setEdit(false)} /></Row>
          </>
        )}
      </Card>
      {!isAdmin && rep.data ? (
        <>
          <SectionTitle>My spending report</SectionTitle>
          <Card>
            <KV k="Paid out of pocket (group)" v={formatINR(rep.data.paidPaise)} /><KV k="Personal spending" v={formatINR(rep.data.personalPaise)} />
            <KV k="Amount owed" v={formatINR(rep.data.owedPaise)} /><KV k="Amount receivable" v={formatINR(rep.data.receivablePaise)} />
            <Txt variant="sub" style={{ marginTop: 6 }}>By category (your confirmed share)</Txt>
            {rep.data.categories.map((c: any) => <KV key={c.category} k={label(c.category)} v={formatINR(c.totalPaise)} />)}
          </Card>
        </>
      ) : null}
      <Btn variant="secondary" icon="key-outline" title="Change password" onPress={() => router.push('/change-password')} />
      <Btn variant="secondary" icon="bug-outline" title="Report a problem" onPress={() => router.push('/report-problem')} />
      <Btn variant="danger" title="Sign out" onPress={logout} />
      <Txt variant="small" style={{ textAlign: 'center' }}>Server: {API_BASE}</Txt>
    </Screen>
  );
}
