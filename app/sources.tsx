import React from 'react';
import { View, Text, Alert, Linking, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../src/api';
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

/** Oura 没有撤销授权的接口，换账号只能让浏览器先登出（清掉登录 cookie） */
const OURA_SIGN_OUT = 'https://cloud.ouraring.com/user/sign-out';

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

  /**
   * 切换 Oura 账号：先断开本地连接，再把浏览器带到 Oura 登出页。
   *
   * 为什么必须登出：Oura 的授权页会记住浏览器里的登录状态，已授权过的应用
   * 再点「去授权」会直接跳回同一个账号，根本没有换账号的机会。
   * Oura 没有 token 撤销端点，authorize 也没有 prompt=consent 之类的参数，
   * 所以只能在浏览器侧先登出。
   */
  const switchAccount = (src: SourceInfo) => {
    Alert.alert(
      '切换 Oura 账号',
      '会先断开当前连接，然后在浏览器里打开 Oura 登出页。\n\n登出后回到这里，点「去授权」用另一个账号登录。',
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
              Alert.alert('操作失败', e?.message || '未知错误');
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  const toggleCred = async (src: SourceInfo) => {
    if (editing === src.id) {      setEditing(null);
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
            {/* 应用级凭据（Oura 的 client_id/secret）已经配好时就不给普通用户看了：
                那不是他的东西，摆在这里只会让人以为「我还得去注册个开发者应用」。
                佳明是个人账号，永远要能改，所以 auth==='account' 时一直显示。 */}
            {src.auth === 'account' || !src.configured ? (
              <Btn
                title={editing === src.id ? '收起凭据' : '凭据'}
                onPress={() => toggleCred(src)}
                disabled={busy === src.id}
                small
              />
            ) : null}
            {src.id === 'oura' ? (
              <Btn
                title="切换账号"
                onPress={() => switchAccount(src)}
                disabled={busy === src.id}
                small
              />
            ) : null}
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

      <Hint label="为什么 Oura 不能当主数据源？">
        Oura 戒指没有 GPS，只能给出睡眠、HRV、准备度和「运动时长」，跑步的距离是手机在旁边时估出来的，
        经常是空的，更没有每公里配速。所以用它补恢复数据很准，跑量和配速还得靠佳明。
      </Hint>

      <Hint label="Oura 会员到底挂在谁身上？">
        走 API 自动同步时：注册应用的开发者账号只要普通 Oura 账号（免费、不用会员）；
        被读取数据的那个人（OAuth 授权方）如果用 Gen3/Gen4 戒指，必须有有效会员，
        Gen2 老戒指不受影响。自建应用默认 10 个用户以内不用审核。
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: S.md },
  credForm: { marginTop: S.md, paddingTop: S.md, borderTopWidth: 0.5, borderTopColor: t.border },
  credNote: { color: t.text3, fontSize: T.micro, lineHeight: 18, marginTop: S.xs },
}));
