import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchAttachmentUri, get, post, uploadAttachment } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg, useLoad } from '@/lib/hooks';
import { formatINR } from '@/lib/money';
import { Avatar, Badge, Banner, Btn, Card, ErrorBox, Field, IconButton, KV, Loading, Money, Row, Screen, SectionTitle, Txt, confirm, notice, shortDateTime } from '@/ui/components';
import { label, useTheme } from '@/ui/theme';

function EvidenceItem({ id, name, onExpand }: { id: number; name: string; onExpand: (uri: string) => void }) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const t = useTheme();
  useEffect(() => { fetchAttachmentUri(id).then(setUri).catch(() => setFailed(true)); }, [id]);
  if (failed) return <Txt variant="small" tone="danger">Failed loading {name}</Txt>;
  if (!uri) return <Txt variant="small" tone="muted">Loading {name}…</Txt>;
  if (uri.startsWith('data:application/pdf')) {
    return (
      <Card tone="neutral" style={{ flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8 }}>
        <Txt style={{ fontSize: 24, marginRight: 10 }}>📄</Txt>
        <Txt variant="sub" style={{ flex: 1 }}>{name} (PDF Document)</Txt>
      </Card>
    );
  }
  return (
    <Pressable onPress={() => onExpand(uri)} style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: t.border, marginBottom: 8 }}>
      <Image source={{ uri }} style={{ width: '100%', height: 220, backgroundColor: t.surfaceAlt }} resizeMode="cover" accessibilityLabel={`Evidence ${name}`} />
      <View style={{ padding: 8, backgroundColor: t.surface }}>
        <Txt variant="caption" tone="muted">{name} (tap to enlarge)</Txt>
      </View>
    </Pressable>
  );
}

export default function ExpenseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me, isAdmin, refreshUnread } = useAuth();
  const t = useTheme();
  const r = useLoad(() => get(`/expenses/${id}`), [id]);
  const [dispute, setDispute] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const x = r.data?.expense;
  if (r.loading && !x) return <Screen><Loading /></Screen>;
  if (r.error || !x) return <Screen><ErrorBox message={r.error ?? 'Expense not found'} onRetry={r.reload} /></Screen>;

  const myAlloc = x.allocations.find((a: any) => a.userId === me?.id);
  const iAmUnconfirmedPayer = x.payerUserId === me?.id && !x.payerConfirmed;
  const isCreator = x.creatorId === me?.id;
  const canRespond = (myAlloc?.approvalStatus === 'PENDING' || iAmUnconfirmedPayer || (myAlloc && !isCreator && ['APPROVED', 'DECLINED'].includes(myAlloc.approvalStatus))) && !['CANCELLED', 'SETTLED'].includes(x.status);
  const involved = isCreator || !!myAlloc || x.payerUserId === me?.id;
  const sponsored = !['INDIVIDUAL', 'GROUP_MEMBER'].includes(x.payerType);

  const run = async (fn: () => Promise<any>, okMsg?: string) => {
    try {
      await fn();
      await r.reload(true);
      refreshUnread();
      if (okMsg) notice('Done', okMsg);
    } catch (e) {
      notice('Could not complete', errMsg(e));
    }
  };

  const addEvidence = async () => {
    const p = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (p.canceled) return;
    const a = p.assets[0];
    await run(() => uploadAttachment('EXPENSE', x.id, { uri: a.uri, name: a.fileName ?? 'evidence.jpg', mimeType: a.mimeType ?? 'image/jpeg', file: (a as any).file }, 'RECEIPT'));
  };

  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      {/* Summary Card */}
      <Card tone={x.status === 'DECLINED' || x.status === 'DISPUTED' ? 'danger' : x.status === 'PENDING_APPROVAL' ? 'action' : undefined}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Txt variant="h1" style={{ flex: 1, marginRight: 8 }}>{x.title}</Txt>
          <Money paise={x.amountPaise} big />
        </Row>
        
        <Row style={{ flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          <Badge text={x.status} tone={x.status === 'APPROVED' ? 'success' : x.status === 'DECLINED' ? 'danger' : x.status === 'PENDING_APPROVAL' ? 'warn' : 'neutral'} />
          {x.visibility === 'PRIVATE' ? <Badge text="Private" tone="action" /> : <Badge text="Public" tone="neutral" />}
          {sponsored ? <Badge text="Sponsored" tone="info" /> : null}
          {x.category === 'PERSONAL' ? <Badge text="Personal" tone="neutral" /> : null}
        </Row>

        {x.status === 'DECLINED' ? <Banner tone="danger" text="A participant declined their share. The creator should edit and resubmit this expense." /> : null}
        {sponsored ? <Banner tone="info" text="Paid by a sponsor: members owe nothing for this expense." /> : null}
        {!x.payerConfirmed && x.payerUserId ? <Banner tone="warn" text="Waiting for the named payer to confirm they paid this out-of-pocket." /> : null}

        <View style={{ gap: 8, marginTop: 8 }}>
          <KV k="Event" v={x.eventName} />
          <KV k="Category" v={`${label(x.category)}${x.subcategory ? ` · ${x.subcategory}` : ''}`} />
          <KV k="Paid by" v={x.payerDisplayName} />
          <KV k="Created by" v={x.creatorName} />
          <KV k="Payment method" v={label(x.paymentMethod)} />
          <KV k="Split method" v={label(x.splitMethod)} />
          <KV k="Spent at" v={shortDateTime(x.spentAt)} />
          {x.location ? <KV k="Location" v={x.location} /> : null}
          {x.fromLocation || x.toLocation ? <KV k="Route" v={`${x.fromLocation ?? ''} → ${x.toLocation ?? ''}`} /> : null}
          {x.privateReason ? <KV k="Private reason" v={x.privateReason} /> : null}
          {x.description ? <KV k="Description" v={x.description} /> : null}
          {x.notes ? <KV k="Notes" v={x.notes} /> : null}
        </View>
      </Card>

      {/* Response Action Card */}
      {canRespond ? (
        <Card tone="action">
          <Txt variant="h2" style={{ marginBottom: 4 }}>
            {iAmUnconfirmedPayer ? 'Did you pay this expense?' : `Your share: ${formatINR(myAlloc?.sharePaise)}`}
          </Txt>
          <Txt variant="sub" tone="muted" style={{ marginBottom: 12 }}>
            {iAmUnconfirmedPayer ? 'Please confirm you paid this out-of-pocket on behalf of the group.' : 'Review your allocated portion and approve or decline.'}
          </Txt>
          <Row style={{ gap: 10 }}>
            {myAlloc?.approvalStatus !== 'APPROVED' || iAmUnconfirmedPayer ? (
              <Btn title={iAmUnconfirmedPayer ? 'Yes, I paid' : 'Approve share'} icon="checkmark-circle-outline" onPress={() => run(() => post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' }), 'Share approved')} />
            ) : null}
            {myAlloc?.approvalStatus !== 'DECLINED' || iAmUnconfirmedPayer ? (
              <Btn variant="danger" title="Decline" icon="close-circle-outline" onPress={async () => { if (await confirm('Decline share?', 'The creator will be notified to adjust the split.', 'Decline')) await run(() => post(`/expenses/${x.id}/respond`, { decision: 'DECLINE' })); }} />
            ) : null}
          </Row>
        </Card>
      ) : null}

      {/* Allocated Members */}
      <SectionTitle>Who benefited ({x.allocations.length})</SectionTitle>
      <Card>
        <View style={{ gap: 12 }}>
          {x.allocations.map((a: any) => (
            <Row key={a.userId} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Row style={{ flex: 1, gap: 10, alignItems: 'center' }}>
                <Avatar name={a.name} userId={a.userId} size={36} />
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontWeight: '600' }}>{a.name}{a.userId === me?.id ? ' (you)' : ''}</Txt>
                  <Txt variant="caption" tone="muted">{a.approvalStatus === 'APPROVED' ? 'Approved' : a.approvalStatus === 'DECLINED' ? 'Declined' : 'Awaiting response'}</Txt>
                </View>
              </Row>
              <Badge text={a.approvalStatus} tone={a.approvalStatus === 'APPROVED' ? 'success' : a.approvalStatus === 'DECLINED' ? 'danger' : 'warn'} />
              <Txt style={{ fontWeight: '700', minWidth: 80, textAlign: 'right' }}>{formatINR(a.sharePaise)}</Txt>
            </Row>
          ))}
        </View>
        <Txt variant="caption" tone="muted" style={{ marginTop: 12 }}>Only approved shares generate settlement debts between members.</Txt>
      </Card>

      {/* Evidence Attachments */}
      <SectionTitle>Evidence & Receipts</SectionTitle>
      <Card>
        {x.attachments.length === 0 ? (
          <Txt variant="sub" tone="muted">No evidence or receipts attached.</Txt>
        ) : (
          x.attachments.map((att: any) => <EvidenceItem key={att.id} id={att.id} name={att.originalName} onExpand={setLightboxUri} />)
        )}
        {(isCreator || isAdmin || x.payerUserId === me?.id) ? (
          <Btn small variant="secondary" icon="attach-outline" title="Upload receipt / evidence" onPress={addEvidence} style={{ marginTop: 8 }} />
        ) : null}
      </Card>

      {/* Disputes */}
      {x.disputes.length ? (
        <>
          <SectionTitle>Disputes ({x.disputes.length})</SectionTitle>
          {x.disputes.map((d: any) => (
            <Card key={d.id} tone="danger">
              <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Txt variant="h3" style={{ flex: 1 }}>{d.reason}</Txt>
                <Badge text={d.status} tone="danger" />
              </Row>
              <Txt variant="caption" tone="muted">{d.raisedByName} · {shortDateTime(d.createdAt)}</Txt>
              {d.message ? <Txt style={{ marginTop: 4 }}>{d.message}</Txt> : null}
              {d.resolutionNote ? <Txt variant="sub" tone="action" style={{ marginTop: 4 }}>Resolution: {d.resolutionNote}</Txt> : null}
            </Card>
          ))}
        </>
      ) : null}

      {/* Actions (Edit, Dispute, Cancel) */}
      <Card style={{ gap: 10 }}>
        {(isCreator || isAdmin) && !['CANCELLED'].includes(x.status) && (x.status !== 'SETTLED' || isAdmin) ? (
          <Btn variant="secondary" icon="create-outline" title="Edit expense" onPress={() => router.push({ pathname: '/expense/new', params: { editId: x.id } })} />
        ) : null}
        {(involved || isAdmin) && x.status !== 'CANCELLED' ? (
          <Btn variant="secondary" icon="flag-outline" title={dispute ? 'Hide dispute form' : 'Report / dispute expense'} onPress={() => setDispute((d) => !d)} />
        ) : null}
        
        {dispute ? (
          <View style={{ gap: 10, padding: 12, backgroundColor: t.surfaceAlt, borderRadius: 12, marginTop: 4 }}>
            <Txt variant="h3">Raise a dispute</Txt>
            <Field label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Incorrect total amount or wrong split" />
            <Field label="Message details (optional)" value={msg} onChangeText={setMsg} multiline placeholder="Provide details for the admin and creator..." />
            <Btn title="Submit dispute" icon="paper-plane-outline" onPress={() => run(async () => {
              if (!reason.trim()) throw new Error('Please enter a reason for the dispute');
              await post(`/expenses/${x.id}/dispute`, { reason: reason.trim(), message: msg.trim() || null });
              setDispute(false); setReason(''); setMsg('');
            }, 'Dispute submitted. Admin notified.')} />
          </View>
        ) : null}

        {(isCreator || isAdmin) && !['CANCELLED', 'SETTLED'].includes(x.status) ? (
          <Btn variant="danger" icon="trash-outline" title="Cancel expense" onPress={async () => {
            if (await confirm('Cancel this expense?', 'It will no longer count toward event totals or balances. Audit logs will be kept.', 'Cancel expense')) {
              await run(() => post(`/expenses/${x.id}/cancel`, { reason: isAdmin && !isCreator ? 'Cancelled by admin' : undefined }), 'Expense cancelled');
            }
          }} />
        ) : null}
      </Card>

      {/* History */}
      {x.history.length ? (
        <>
          <SectionTitle>Activity Log</SectionTitle>
          <Card>
            <View style={{ gap: 8 }}>
              {x.history.map((h: any) => (
                <KV key={h.id} k={shortDateTime(h.createdAt)} v={`${label(h.action)} · ${h.actorName ?? 'System'}`} />
              ))}
            </View>
          </Card>
        </>
      ) : null}

      {/* Lightbox Modal for Evidence */}
      <Modal visible={!!lightboxUri} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }} onPress={() => setLightboxUri(null)}>
          {lightboxUri ? (
            <Image source={{ uri: lightboxUri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
          ) : null}
          <IconButton icon="close" size={24} onPress={() => setLightboxUri(null)} style={{ position: 'absolute', top: 40, right: 20, backgroundColor: '#333' }} />
        </Pressable>
      </Modal>
    </Screen>
  );
}

