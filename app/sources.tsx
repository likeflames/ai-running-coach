import React from 'react';
import { View, Text, Alert, Linking, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../src/api';
import { API_CANDIDATES } from '../src/config';
import { Screen, Card, Loading, ErrorBox, Pill, Btn, Hint, Field } from '../src/ui';
import { S, T, type Theme } from '../src/theme';
import { makeStyles, useTheme } from '../src/theme-provider';

interface SourceInfo {
  id: string;
  name: string;
  subtitle: string;
  provides: string[];
  auth: string;
  docs: string;
  note: string;
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

/** Safari 里选文件上传，不需要给 App 加原生文件选择器 */
const IMPORT_URL = `${API_CANDIDATES[0]}/static/oura-import.html`;

export default function SourcesScreen() {
  const t = useTheme();
  const s = useStyles();
  const [items, setItems] = React.useState<SourceInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  // 「凭据」表单：editing 是正在编辑哪个数据源，credFields 是后端说该填什么
  const [editing, setEditing] = React.useState<string | null>(null);
  const [credFields, setCredFields] = React.useState<CredField[]>([]);
  const [form, setForm] = React.useState<Record<string, string>>({});

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

  // 从 Safari 授权回来页面会重新获得焦点，这时自动刷新状态
  useFocusEffect(
    React.useCallback(() => {
      load(true);
    }, [load])
  );

  const connect = async (src: SourceInfo) => {
    setBusy(src.id);
    try {
      const r = await api.post<{ url?: string; connected?: boolean }>(`/api/sources/${src.id}/connect`, {});
      if (r?.url) {
        await Linking.openURL(r.url);
        Alert.alert(
          '在 Safari 里完成授权',
          `授权成功后回到这里，${src.name} 就会显示「已连接」，再点「同步」拉数据。`
        );
      } else {
        await load(true);
      }
    } catch (e: any) {
      Alert.alert('连接失败', e?.message || '未知错误');
    } finally {
      setBusy(null);
    }
  };

  const sync = async (src: SourceInfo) => {
    setBusy(src.id);
    try {
      const r = await api.post<any>(`/api/sources/${src.id}/sync?days=14`, {}, 120000);
      const rec = r?.recovery?.recovery_days ?? 0;
      const act = r?.activity?.activities;
      Alert.alert(
        '同步完成',
        `${src.name}：更新 ${rec} 天恢复数据${act != null ? `，新增 ${act} 条训练` : ''}。`
      );
      await load(true);
    } catch (e: any) {
      Alert.alert('同步失败', e?.message || '未知错误');
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
            Alert.alert('操作失败', e?.message || '未知错误');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const toggleCred = async (src: SourceInfo) => {
    if (editing === src.id) {
      setEditing(null);
      return;
    }
    setBusy(src.id);
    try {
      const d = await api.get<{ fields: CredField[] }>(`/api/settings/sources/${src.id}`);
      setCredFields(d.fields || []);
      setForm({});
      setEditing(src.id);
    } catch (e: any) {
      Alert.alert('加载失败', e?.message || '未知错误');
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
      Alert.alert('没有改动', '输入框都空着：填了才保存，不填不影响现有配置。');
      return;
    }
    setBusy(src.id);
    try {
      const r = await api.put<{ ok: boolean; configured: boolean; test?: { ok: boolean; message?: string; error?: string } }>(
        `/api/settings/sources/${src.id}`,
        { values, test: true },
        90000
      );
      if (r?.test && !r.test.ok) {
        Alert.alert('已保存，但验证没通过', r.test.error || '可以先保存，稍后再试');
      } else {
        Alert.alert(
          '已保存',
          r?.test?.message || (r?.configured ? '凭据齐了，可以点「去授权 / 连接」' : '已保存')
        );
      }
      setEditing(null);
      setForm({});
      await load(true);
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '未知错误');
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
      <Text style={s.hint}>
        数据源负责把「身体恢复」和「跑了什么」喂给教练。可以同时连多个，互补合并，不会互相覆盖。
      </Text>

      {items.map((src) => (
        <Card key={src.id} style={{ marginBottom: S.md }}>
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <View style={s.titleRow}>
                <Text style={s.name}>{src.name}</Text>
                <Pill
                  text={src.connected ? '已连接' : src.configured ? '未连接' : '未配置'}
                  color={src.connected ? t.good : src.configured ? t.text3 : t.warn}
                />
              </View>
              <Text style={s.sub}>{src.subtitle}</Text>
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

          <Text style={s.note}>{src.note}</Text>

          {src.connected ? (
            <Text style={s.meta}>
              {src.account ? `${src.account} · ` : ''}
              {src.last_sync_at ? `上次同步 ${src.last_sync_at.slice(5, 16).replace('T', ' ')}` : '还没有同步过'}
            </Text>
          ) : null}

          {src.last_error ? <Text style={[s.meta, { color: t.bad }]}>{src.last_error}</Text> : null}

          <View style={s.actions}>
            {!src.connected ? (
              <Btn
                title={src.configured ? (src.auth === 'oauth' ? '去授权' : '连接') : '填写凭据'}
                onPress={() => (src.configured ? connect(src) : toggleCred(src))}
                disabled={busy === src.id}
                primary
                small
              />
            ) : (
              <>
                <Btn title="同步" onPress={() => sync(src)} disabled={busy === src.id} primary small />
                <Btn title="断开" onPress={() => disconnect(src)} disabled={busy === src.id} small />
              </>
            )}
            <Btn
              title={editing === src.id ? '收起凭据' : '凭据'}
              onPress={() => toggleCred(src)}
              disabled={busy === src.id}
              small
            />
          </View>

          {editing === src.id ? (
            <View style={s.credForm}>
              {credFields.map((f) => (
                <Field
                  key={f.field}
                  label={f.label}
                  value={form[f.field] || ''}
                  onChangeText={(v) => setForm({ ...form, [f.field]: v })}
                  secure={f.field !== 'client_id' && f.field !== 'email'}
                  placeholder={f.set ? `已保存（${f.masked}），留空则不修改` : ''}
                  hint={
                    f.layer === 'platform'
                      ? '应用级凭据，全平台共用一份，管理员填一次即可'
                      : '你的账号，加密存储，只有你的数据会用到它'
                  }
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
              {src.auth === 'oauth' ? (
                <Text style={s.credNote}>
                  {src.name} 用的是 OAuth 授权：这里填的是「应用身份」（开发者注册得到），
                  填完后再点「去授权」，用你自己的账号登录允许访问。
                </Text>
              ) : null}
            </View>
          ) : null}
        </Card>
      ))}

      <Card style={{ marginBottom: S.md }}>
        <View style={s.titleRow}>
          <Text style={s.name}>离线导入 Oura 数据</Text>
          <Pill text="无需授权" color={t.good} />
        </View>
        <Text style={s.sub}>上传会员中心导出的 ZIP，补进睡眠 / HRV / 准备度</Text>
        <Text style={s.note}>
          不经过 Oura API，也不用开发者应用或会员资格。在 Safari 里选文件、先检查再确认导入，
          重复的数据会自动跳过。
        </Text>
        <View style={s.actions}>
          <Btn title="打开导入页" onPress={() => Linking.openURL(IMPORT_URL)} primary small />
        </View>
      </Card>

      <Hint label="为什么 Oura 不能当主数据源？">
        Oura 戒指没有 GPS，只能给出睡眠、HRV、准备度和「运动时长」，跑步的距离是手机在旁边时估出来的，
        经常是空的，更没有每公里配速。所以用它补恢复数据很准，跑量还得靠佳明或 Strava。
        {'\n\n'}
        Strava 是跑步数据的事实标准（距离、配速、心率、分段、轨迹都有），
        但 2026 年起 Strava 要求开发者账号本身是付费订阅用户才能创建 API 应用，
        且默认只能授权自己一个账号（10 人以内无需审核）。
      </Hint>

      <Hint label="Oura 会员到底挂在谁身上？">
        走 API 自动同步时：注册应用的开发者账号只要普通 Oura 账号（免费、不用会员）；
        被读取数据的那个人（OAuth 授权方）如果用 Gen3/Gen4 戒指，必须有有效会员，
        Gen2 老戒指不受影响。自建应用默认 10 个用户以内不用审核。
        {'\n\n'}
        但 Oura 的 API 协议禁止把通过 API 取得的数据提供给大模型（包括拼进 prompt 生成建议）。
        所以要把恢复数据喂给 AI 教练、或者发给别人用，走上面的「离线导入」更稳妥。
      </Hint>

      <Hint label="多人共用的前提">
        现在整套数据库是单人的。要让别人也能用（各自的数据互不可见），
        需要先做「账号 + 按用户隔离数据库」，这是下一步的活。
      </Hint>
    </Screen>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  hint: { color: t.text3, fontSize: T.caption, lineHeight: 20, marginBottom: S.md },
  head: { flexDirection: 'row', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: t.text, fontSize: T.body + 1, fontWeight: '600', letterSpacing: -0.2 },
  sub: { color: t.text3, fontSize: T.caption, marginTop: 3 },
  caps: { flexDirection: 'row', gap: 6, marginTop: S.sm },
  cap: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  capText: { fontSize: T.micro, fontWeight: '500' },
  note: { color: t.text3, fontSize: T.micro, lineHeight: 18, marginTop: S.sm },
  meta: { color: t.text3, fontSize: T.micro, marginTop: 6 },
  actions: { flexDirection: 'row', gap: S.sm, marginTop: S.md },
  credForm: { marginTop: S.md, paddingTop: S.md, borderTopWidth: 0.5, borderTopColor: t.border },
  credNote: { color: t.text3, fontSize: T.micro, lineHeight: 18, marginTop: S.xs },
}));
