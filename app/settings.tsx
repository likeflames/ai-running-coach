import React from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { api, authApi, logout, setAccessToken } from '../src/api';
import { Screen, Section, List, ListRow, Card, Segmented, ColorDots, Btn, Divider } from '../src/ui';
import { S, T, ACCENTS, ACCENT_LIST, type Theme, type Appearance, type AccentId } from '../src/theme';
import { makeStyles, useTheme, useThemeControl } from '../src/theme-provider';
import { getReminderSettings, setReminderEnabled, type ReminderSettings } from '../src/notify';

const TIME_PRESETS = [
  { h: 6, m: 30, label: '6:30' },
  { h: 7, m: 0, label: '7:00' },
  { h: 7, m: 30, label: '7:30' },
  { h: 8, m: 0, label: '8:00' },
];

interface Me {
  uid: string;
  username: string;
  display_name: string;
  is_admin: boolean;
}

export default function SettingsScreen() {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();
  const [me, setMe] = React.useState<Me | null>(null);
  const [rem, setRem] = React.useState<ReminderSettings>({ enabled: false, hour: 7, minute: 20 });
  const [remBusy, setRemBusy] = React.useState(false);
  const [pwOpen, setPwOpen] = React.useState(false);
  const [oldPw, setOldPw] = React.useState('');
  const [newPw, setNewPw] = React.useState('');
  const [pwBusy, setPwBusy] = React.useState(false);
  const [pwMsg, setPwMsg] = React.useState('');

  useFocusEffect(
    React.useCallback(() => {
      authApi.me().then(setMe).catch(() => {});
      getReminderSettings().then(setRem);
    }, [])
  );

  const toggleReminder = async (on: boolean) => {
    setRemBusy(true);
    try {
      const r: any = await setReminderEnabled(on, rem.hour, rem.minute);
      if (!r.ok) {
        setRem({ ...rem, enabled: false });
        Alert.alert('没有通知权限', '到 iPhone「设置 → 通知 → AI跑步教练」里允许通知，再回来打开。');
        return;
      }
      setRem({ ...rem, enabled: on });
    } catch {
      Alert.alert('设置失败', '稍后再试');
    } finally {
      setRemBusy(false);
    }
  };

  const pickTime = async (h: number, m: number) => {
    const next = { ...rem, hour: h, minute: m };
    setRem(next);
    if (next.enabled) await setReminderEnabled(true, h, m).catch(() => {});
  };

  const changePassword = async () => {
    setPwMsg('');
    if (newPw.length < 8) return setPwMsg('新密码至少 8 位');
    setPwBusy(true);
    try {
      const r = await api.post<{ token: string }>('/api/auth/password', {
        old_password: oldPw,
        new_password: newPw,
      });
      await setAccessToken(r.token);
      setOldPw('');
      setNewPw('');
      setPwOpen(false);
      Alert.alert('已更新', '其他设备上的登录已失效，需要用新密码重新登录。');
    } catch (e: any) {
      setPwMsg(e?.message || '修改失败');
    } finally {
      setPwBusy(false);
    }
  };

  const onLogout = () => {
    Alert.alert('退出登录', '退出后需要重新输入用户名和密码，训练数据不会删除。', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <Screen>
      <Section title="账号">
        <List>
          <ListRow
            title={me?.display_name || '—'}
            sub={me?.username ? `@${me.username}` : '加载中…'}
          />
          <ListRow title="退出登录" onPress={onLogout} chevron />
        </List>
      </Section>

      <Section title="训练设置">
        <List>
          <ListRow
            title="个人资料"
            sub="目标、5 公里成绩、体重、比赛日期"
            onPress={() => router.push('/profile')}
            chevron
          />
          <ListRow
            title="数据源"
            sub="佳明、Oura、苹果健康"
            onPress={() => router.push('/sources')}
            chevron
          />
        </List>
      </Section>

      <Section title="提醒">
        <List>
          <ListRow
            title="每天提醒"
            sub="早上提醒今天练什么"
            right={
              remBusy ? (
                <ActivityIndicator color={t.text2} />
              ) : (
                <Switch
                  value={rem.enabled}
                  onValueChange={toggleReminder}
                  trackColor={{ false: t.cardInner, true: t.good }}
                />
              )
            }
          />
          {rem.enabled ? (
            <View style={s.block}>
              <Text style={[s.blockLabel, { color: t.text2 }]}>提醒时间</Text>
              <View style={{ marginTop: S.sm }}>
                <Segmented
                  options={TIME_PRESETS.map((p) => ({ value: `${p.h}:${p.m}`, label: p.label }))}
                  value={`${rem.hour}:${rem.minute}`}
                  onChange={(v) => {
                    const [h, m] = v.split(':').map(Number);
                    pickTime(h, m);
                  }}
                />
              </View>
            </View>
          ) : null}
        </List>
      </Section>

      <Section title="外观">
        <List>
          <View style={s.block}>
            <Text style={[s.blockLabel, { color: t.text2 }]}>模式</Text>
            <View style={{ marginTop: S.sm }}>
              <AppearancePicker />
            </View>
          </View>
          <View style={s.block}>
            <Text style={[s.blockLabel, { color: t.text2 }]}>强调色</Text>
            <View style={{ marginTop: S.sm }}>
              <AccentPicker />
            </View>
          </View>
        </List>
      </Section>

      <Section title="安全">
        <List>
          <ListRow
            title="修改密码"
            sub={pwOpen ? undefined : '修改后其他设备需要重新登录'}
            onPress={() => {
              setPwOpen((v) => !v);
              setPwMsg('');
            }}
            chevron={!pwOpen}
          />
          {pwOpen ? (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={s.pwBox}>
                <TextInput
                  value={oldPw}
                  onChangeText={setOldPw}
                  placeholder="当前密码"
                  placeholderTextColor={t.text3}
                  secureTextEntry
                  autoCapitalize="none"
                  style={[s.input, { backgroundColor: t.bgSoft, color: t.text, borderColor: t.borderSoft }]}
                />
                <TextInput
                  value={newPw}
                  onChangeText={setNewPw}
                  placeholder="新密码（至少 8 位）"
                  placeholderTextColor={t.text3}
                  secureTextEntry
                  autoCapitalize="none"
                  style={[s.input, { backgroundColor: t.bgSoft, color: t.text, borderColor: t.borderSoft }]}
                />
                {pwMsg ? <Text style={[s.pwMsg, { color: t.bad }]}>{pwMsg}</Text> : null}
                <Btn title={pwBusy ? '提交中…' : '确认修改'} onPress={changePassword} primary />
              </View>
            </KeyboardAvoidingView>
          ) : null}
        </List>
      </Section>

      <Section title="关于">
        <Card>
          <Text style={[s.about, { color: t.text2 }]}>
            数据按账号隔离。生成建议时必要的摘要会发送给模型服务；本应用不提供医疗诊断。
          </Text>
          <View style={{ height: S.md }} />
          <Divider />
          <Text style={[s.version, { color: t.text3 }]}>
            AI 跑步教练 · {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </Card>
      </Section>
    </Screen>
  );
}

function AppearancePicker() {
  const { appearance, setAppearance } = useThemeControl();
  return (
    <Segmented<Appearance>
      options={[
        { value: 'system', label: '跟随系统' },
        { value: 'light', label: '浅色' },
        { value: 'dark', label: '深色' },
      ]}
      value={appearance}
      onChange={setAppearance}
    />
  );
}

function AccentPicker() {
  const t = useTheme();
  const { accent, setAccent } = useThemeControl();
  return (
    <ColorDots
      colors={ACCENT_LIST.map((id) => ({ id, color: t.dark ? ACCENTS[id].dark : ACCENTS[id].light }))}
      value={accent}
      onChange={(id) => setAccent(id as AccentId)}
    />
  );
}

const useStyles = makeStyles((t: Theme) => ({
  block: { paddingHorizontal: S.md, paddingVertical: 12 },
  blockLabel: { fontSize: T.caption },
  pwBox: { paddingHorizontal: S.md, paddingBottom: S.md, gap: S.sm },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: S.md,
    paddingVertical: 12,
    fontSize: 16,
  },
  pwMsg: { fontSize: T.caption },
  about: { fontSize: T.caption, lineHeight: 20 },
  version: { fontSize: T.micro, marginTop: S.sm },
}));
