import React from 'react';
import { View, Text, Alert, Linking, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { api, authApi } from '../src/api';
import { Screen, Card, Loading, ErrorBox, Pill, Btn, Field } from '../src/ui';
import { S, T, type Theme } from '../src/theme';
import { makeStyles, useTheme } from '../src/theme-provider';

interface SourceInfo {
  id: string;
  name: string;
  subtitle: string;
  provides: string[];
  auth: string;
  configured: boolean;
  connected: boolean;
  account: string;
  last_sync_at: string | null;
  last_error: string;
}

interface CredField {
  field: string;
  label: string;
  layer: 'platform' | 'user';
  set: boolean;
  source: string;
  masked: string;
}

const CAP: Record<string, string> = {
  recovery: '恢复',
  activity: '训练',
  push: '推送课表',
};

/** Oura 没有撤销授权的接口，换账号只能让浏览器先登出 */
const OURA_SIGN_OUT = 'https://cloud.ouraring.com/user/sign-out';

export default function SourcesScreen() {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();
  const [items, setItems] = React.useState<SourceInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [credFields, setCredFields] = React.useState<CredField[]>([]);
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = React.useState(false);

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = await api.get<{ sources: SourceInfo[] }>('/api/sources');
      setItems(d.sources || []);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      load(true);
      authApi.me().then((m: any) => setIsAdmin(!!m?.is_admin)).catch(() => {});
    }, [load])
  );

  const connect = async (src: SourceInfo) => {
    setBusy(src.id);
    try {
      const r = await api.post<{ url?: string; connected?: boolean }>(`/api/sources/${src.id}/connect`, {});
      if (r?.url) {
        await Linking.openURL(r.url);
        Alert.alert('在 Safari 里完成授权', `授权成功后回到这里，${src.name} 会显示「已连接」。`);
      } else {
        await load(true);
      }
    } catch (e: any) {
      Alert.alert('连接失败', e?.message || '稍后再试');
    } finally {
      setBusy(null);
    }
  };

  const sync = async (src: SourceInfo) => {
    setBusy(src.id);
    try {
      const days = src.auth === 'oauth' ? 90 : 14;
      const r = await api.post<any>(`/api/sources/${src.id}/sync?days=${days}`, {}, 120000);
      const rec = r?.recovery?.recovery_days ?? 0;
      const act = r?.activity?.activities;
      Alert.alert(
        '同步完成',
        `${src.name}：更新 ${rec} 天恢复数据${act != null ? `，新增 ${act} 条训练` : ''}。`
      );
      await load(true);
    } catch (e: any) {
      Alert.alert('同步没成功', e?.message || '稍后再试');
      await load(true);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = (src: SourceInfo) => {
    Alert.alert('断开连接', `断开 ${src.name} 后，已同步的数据会保留，但不再自动更新。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '断开',
        style: 'destructive',
        onPress: async () => {
          setBusy(src.id);
          try {
            await api.post(`/api/sources/${src.id}/disconnect`, {});
            await load(true);
          } catch (e: any) {
            Alert.alert('操作失败', e?.message || '稍后再试');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const switchAccount = (src: SourceInfo) => {
    Alert.alert(
      '切换 Oura 账号',
      '会先断开当前连接，再打开 Oura 登出页。登出后回来点「连接」，用另一个账号授权。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '继续',
          style: 'destructive',
          onPress: async () => {
            setBusy(src.id);
            try {
              await api.post(`/api/sources/${src.id}/disconnect`, {});
              await load(true);
              await Linking.openURL(OURA_SIGN_OUT);
            } catch (e: any) {
              Alert.alert('操作失败', e?.message || '稍后再试');
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  const toggleCred = async (src: SourceInfo) => {
    if (editing === src.id) {
      setEditing(null);
      return;
    }
    setBusy(src.id);
    try {
      const d = await api.get<{ fields: CredField[] }>(`/api/settings/sources/${src.id}`);
      // 平台级凭据（Oura 应用密钥）只有管理员能看到和修改
      const fields = (d.fields || []).filter((f) => f.layer === 'user' || isAdmin);
      setCredFields(fields);
      setForm({});
      setEditing(src.id);
    } catch (e: any) {
      Alert.alert('加载失败', e?.message || '稍后再试');
    } finally {
      setBusy(null);
    }
  };

  const saveCred = async (src: SourceInfo) => {
    const values: Record<string, string> = {};
    credFields.forEach((f) => {
      const v = (form[f.field] || '').trim();
      if (v) values[f.field] = v;
    });
    if (!Object.keys(values).length) {
      Alert.alert('没有改动', '填了才会保存，留空表示不修改。');
      return;
    }
    setBusy(src.id);
    try {
      const r = await api.put<{
        ok: boolean;
        configured: boolean;
        test?: { ok: boolean; message?: string; error?: string };
      }>(`/api/settings/sources/${src.id}`, { values, test: true }, 90000);
      if (r?.test && !r.test.ok) {
        Alert.alert('已保存，但验证没通过', r.test.error || '稍后再试');
      } else {
        Alert.alert('已保存', r?.test?.message || '可以点「连接」了');
      }
      setEditing(null);
      setForm({});
      await load(true);
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '稍后再试');
    } finally {
      setBusy(null);
    }
  };

  const uploadFit = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];
      setBusy('upload');
      const out = await api.upload<any>('/api/upload-fit', file.uri, file.name, 'application/octet-stream');
      if (out?.success) {
        Alert.alert(
          '已导入',
          `${out.activity?.distance_km ?? '-'} 公里 · ${out.activity?.avg_pace ?? '-'} · 心率 ${out.activity?.avg_hr ?? '-'}`
        );
      } else {
        Alert.alert('导入失败', out?.error || '文件可能不是 .fit 格式');
      }
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || '稍后再试');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading />;
  if (err)
    return (
      <Screen noTabBar>
        <ErrorBox message={err} onRetry={() => load()} />
      </Screen>
    );

  return (
    <Screen noTabBar>
      <Text style={[s.hint, { color: t.text3 }]}>
        数据源负责把「身体恢复」和「跑了什么」喂给教练。可以同时连多个，互补合并。
      </Text>

      {items.map((src) => {
        const personal = src.auth === 'account';
        const push = src.auth === 'push';
        const needsCred = personal && !src.configured;
        return (
          <Card key={src.id} style={{ marginBottom: S.md }}>
            <View style={s.head}>
              <View style={{ flex: 1 }}>
                <View style={s.titleRow}>
                  <Text style={[s.name, { color: t.text }]}>{src.name}</Text>
                  <Pill
                    text={
                      push
                        ? src.connected
                          ? '已接入'
                          : '未接入'
                        : src.connected
                          ? '已连接'
                          : src.configured
                            ? '未连接'
                            : '不可用'
                    }
                    color={src.connected ? t.good : src.configured ? t.text3 : t.warn}
                  />
                </View>
                <Text style={[s.sub, { color: t.text3 }]}>{src.subtitle}</Text>
              </View>
              {busy === src.id ? <ActivityIndicator color={t.text3} /> : null}
            </View>

            <View style={s.caps}>
              {src.provides.map((p) => (
                <View key={p} style={[s.cap, { backgroundColor: t.cardInner }]}>
                  <Text style={[s.capText, { color: t.text2 }]}>{CAP[p] || p}</Text>
                </View>
              ))}
            </View>

            {src.connected ? (
              <Text style={[s.meta, { color: t.text3 }]}>
                {src.account ? `${src.account} · ` : ''}
                {src.last_sync_at
                  ? `上次同步 ${src.last_sync_at.slice(5, 16).replace('T', ' ')}`
                  : push
                    ? '还没有收到数据'
                    : '还没有同步过'}
              </Text>
            ) : null}

            {src.last_error ? <Text style={[s.meta, { color: t.bad }]}>{src.last_error}</Text> : null}

            <View style={s.actions}>
              {push ? (
                // 推送型数据源没有「连接」这个动作，只有一次性的配置说明
                <Btn title="设置接入" onPress={() => router.push('/health-setup')} primary small />
              ) : !src.connected ? (
                <Btn
                  title={needsCred ? '填写账号' : '连接'}
                  onPress={() => (needsCred ? toggleCred(src) : connect(src))}
                  disabled={busy === src.id || !src.configured}
                  primary
                  small
                />
              ) : (
                <>
                  <Btn title="同步" onPress={() => sync(src)} disabled={busy === src.id} primary small />
                  <Btn title="断开" onPress={() => disconnect(src)} disabled={busy === src.id} small />
                </>
              )}
              {personal ? (
                <Btn
                  title={editing === src.id ? '收起' : '账号'}
                  onPress={() => toggleCred(src)}
                  disabled={busy === src.id}
                  small
                />
              ) : null}
              {isAdmin && src.auth === 'oauth' ? (
                <Btn
                  title={editing === src.id ? '收起' : '应用配置'}
                  onPress={() => toggleCred(src)}
                  disabled={busy === src.id}
                  small
                />
              ) : null}
              {src.id === 'oura' && src.connected ? (
                <Btn title="切换账号" onPress={() => switchAccount(src)} disabled={busy === src.id} small />
              ) : null}
            </View>

            {editing === src.id ? (
              <View style={[s.credForm, { borderTopColor: t.border }]}>
                {credFields.map((f) => (
                  <Field
                    key={f.field}
                    label={f.label}
                    value={form[f.field] || ''}
                    onChangeText={(v) => setForm({ ...form, [f.field]: v })}
                    secure={f.field !== 'client_id' && f.field !== 'email'}
                    placeholder={f.set ? `已保存（${f.masked}），留空不修改` : ''}
                  />
                ))}
                <View style={s.actions}>
                  <Btn
                    title={busy === src.id ? '保存中…' : '保存'}
                    onPress={() => saveCred(src)}
                    disabled={busy === src.id}
                    primary
                    small
                  />
                </View>
              </View>
            ) : null}
          </Card>
        );
      })}

      <Card>
        <Text style={[s.name, { color: t.text }]}>导入 .fit 文件</Text>
        <Text style={[s.sub, { color: t.text3, marginTop: 4 }]}>
          从佳明或手表导出的原始文件，会解析出轨迹、秒级心率和配速。
        </Text>
        <View style={s.actions}>
          <Btn
            title={busy === 'upload' ? '解析中…' : '选择文件'}
            onPress={uploadFit}
            disabled={busy === 'upload'}
            small
          />
        </View>
      </Card>
    </Screen>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  hint: { fontSize: T.caption, lineHeight: 20, marginBottom: S.md },
  head: { flexDirection: 'row', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: T.body + 1, fontWeight: '600', letterSpacing: -0.2 },
  sub: { fontSize: T.caption, marginTop: 3, lineHeight: 18 },
  caps: { flexDirection: 'row', gap: 6, marginTop: S.sm },
  cap: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  capText: { fontSize: T.micro, fontWeight: '500' },
  meta: { fontSize: T.micro, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: S.md },
  credForm: { marginTop: S.md, paddingTop: S.md, borderTopWidth: 0.5 },
}));
