import React from 'react';
import { View, Text, Alert, ActivityIndicator, Pressable } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { api, getApiBase } from '../src/api';
import { Screen, Section, Card, Btn, Hint, Loading, ErrorBox } from '../src/ui';
import { S, T, type Theme } from '../src/theme';
import { makeStyles, useTheme } from '../src/theme-provider';

/**
 * 苹果健康接入引导
 *
 * 这里要解决的是「怎么让一个不懂技术的朋友，在自己手机上把数据接上」。
 * 所以不写原理，只写动作：点哪里、填什么、看到什么算成功。
 * 两条路并列给出，因为它们的取舍不一样——自动但要配一次，全量但要手动点。
 */

interface SetupInfo {
  key: string;
  url: string;
  fields: { key: string; desc: string }[];
}

export default function HealthSetupScreen() {
  const t = useTheme();
  const s = useStyles();

  const [info, setInfo] = React.useState<SetupInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<SetupInfo>('/api/health/setup');
      setInfo(d);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const endpoint = info?.url || `${getApiBase()}/api/health/push`;

  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 1600);
  };

  const importZip = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];
      if (!/\.zip$/i.test(file.name || '')) {
        Alert.alert('需要 .zip 文件', '在「健康」App 里导出后会得到一个 zip，直接选它。');
        return;
      }
      setBusy(true);
      const out = await api.upload<any>(
        '/api/health/import',
        file.uri,
        file.name || 'export.zip',
        'application/zip',
        300000
      );
      const days = out?.recovery_days ?? 0;
      const runs = out?.activities ?? 0;
      Alert.alert(
        '导入完成',
        `补充了 ${days} 天的恢复数据${runs ? `，新增 ${runs} 条跑步` : ''}。\n\n回到首页下拉刷新就能看到。`
      );
    } catch (e: any) {
      Alert.alert('导入没成功', e?.message || '文件可能不完整，重新导出一次再试');
    } finally {
      setBusy(false);
    }
  };

  const rotate = () => {
    Alert.alert(
      '换一把密钥',
      '换完以后旧的立刻失效。手机上已经配好的快捷指令要改成新的，否则数据推不上来。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '换',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const r = await api.post<{ key: string }>('/api/health/key/rotate', {});
              setInfo((d) => (d ? { ...d, key: r.key } : d));
            } catch (e: any) {
              Alert.alert('没换成', e?.message || '稍后再试');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  if (loading) return <Loading />;
  if (err)
    return (
      <Screen noTabBar>
        <ErrorBox message={err} onRetry={load} />
      </Screen>
    );

  return (
    <Screen noTabBar>
      <Text style={s.lead}>苹果健康数据由手机推送到服务器，两种方式可同时用。</Text>

      <Section title="方式一 · 每天自动" desc="配一次，之后每天定时自己跑。推荐先做这个。">
        <Card>
          <Text style={s.stepTitle}>需要填进快捷指令的两样东西</Text>

          <Pressable onPress={() => copy('url', endpoint)} style={[s.copyRow, { borderColor: t.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.copyLabel}>服务器地址</Text>
              <Text style={[s.copyValue, { color: t.text }]} numberOfLines={1}>
                {endpoint}
              </Text>
            </View>
            <Text style={[s.copyBtn, { color: copied === 'url' ? t.good : t.accent }]}>
              {copied === 'url' ? '已复制' : '复制'}
            </Text>
          </Pressable>

          <Pressable onPress={() => copy('key', info!.key)} style={[s.copyRow, { borderColor: t.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.copyLabel}>推送密钥</Text>
              <Text style={[s.copyValue, { color: t.text }]} numberOfLines={1}>
                {info!.key}
              </Text>
            </View>
            <Text style={[s.copyBtn, { color: copied === 'key' ? t.good : t.accent }]}>
              {copied === 'key' ? '已复制' : '复制'}
            </Text>
          </Pressable>

          <Text style={s.warn}>密钥仅有写入权限，无法读取数据。</Text>
        </Card>

        <Card style={{ marginTop: S.md }}>
          <Text style={s.stepTitle}>在「快捷指令」里做这 5 步</Text>
          {[
            '打开「快捷指令」App，点右上角 + 新建一个',
            '添加动作「获取 URL 内容」',
            'URL 填上面复制的服务器地址，方法选 POST，请求体选 JSON',
            '请求体里加一个字段 key，值填上面复制的推送密钥',
            '再加你要的字段（见下表），保存，然后到「自动化」里设成每天 8:00 运行',
          ].map((line, i) => (
            <View key={i} style={s.stepRow}>
              <Text style={[s.stepNo, { color: t.accent }]}>{i + 1}</Text>
              <Text style={[s.stepText, { color: t.text2 }]}>{line}</Text>
            </View>
          ))}
        </Card>

        <Card style={{ marginTop: S.md }}>
          <Text style={s.stepTitle}>字段名照着抄，只填你想要的</Text>
          <Text style={s.stepDesc}>字段值用「查找健康样本」动作取得；名称写错会被忽略。</Text>
          {info!.fields.map((f) => (
            <View key={f.key} style={[s.fieldRow, { borderTopColor: t.border }]}>
              <Text style={[s.fieldKey, { color: t.text }]}>{f.key}</Text>
              <Text style={[s.fieldDesc, { color: t.text3 }]}>{f.desc}</Text>
            </View>
          ))}
        </Card>
      </Section>

      <Section
        title="方式二 · 一次性补齐历史"
        desc="补齐历史数据，之后每隔一两个月导一次。"
      >
        <Card>
          <Text style={s.stepTitle}>手机上导出</Text>
          {[
            '打开「健康」App，点右上角头像',
            '拉到最下面，点「导出所有健康数据」',
            '等它打包完，选「存储到文件」',
            '回到这里点下面的按钮，选那个 zip',
          ].map((line, i) => (
            <View key={i} style={s.stepRow}>
              <Text style={[s.stepNo, { color: t.accent }]}>{i + 1}</Text>
              <Text style={[s.stepText, { color: t.text2 }]}>{line}</Text>
            </View>
          ))}

          <View style={s.actions}>
            <Btn
              title={busy ? '正在解析…' : '选择 zip 文件'}
              onPress={importZip}
              disabled={busy}
              primary
            />
          </View>
          {busy ? (
            <View style={s.busyRow}>
              <ActivityIndicator color={t.text3} />
              <Text style={s.busyText}>几年的数据可能要一两分钟，别退出这一页</Text>
            </View>
          ) : null}
        </Card>
      </Section>

      <Section title="数据怎么合并">
        <Card>
          <Text style={s.body}>同一指标以佳明为准，苹果健康补齐缺项；跑步记录按时间去重。</Text>
          <View style={[s.actions, { marginTop: S.md }]}>
            <Btn title="换一把密钥" onPress={rotate} disabled={busy} small />
          </View>
        </Card>
      </Section>

      <Hint label="为什么不做成自动授权？">
        读取健康数据需要付费开发者账号的权限；快捷指令不需要，但需手动配置一次。
      </Hint>
    </Screen>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  lead: { color: t.text3, fontSize: T.caption, lineHeight: 20, marginBottom: S.md },
  stepTitle: { color: t.text, fontSize: T.body, fontWeight: '600', letterSpacing: -0.2 },
  stepDesc: { color: t.text3, fontSize: T.caption, lineHeight: 19, marginTop: 4, marginBottom: S.sm },
  stepRow: { flexDirection: 'row', gap: 10, marginTop: S.sm, alignItems: 'flex-start' },
  stepNo: { fontSize: T.caption, fontWeight: '600', width: 14, lineHeight: 20 },
  stepText: { flex: 1, fontSize: T.caption, lineHeight: 20 },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    marginTop: S.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 0.5,
    borderRadius: 10,
  },
  copyLabel: { color: t.text3, fontSize: T.micro },
  copyValue: { fontSize: T.caption, marginTop: 3 },
  copyBtn: { fontSize: T.caption, fontWeight: '600' },
  warn: { color: t.text3, fontSize: T.micro, lineHeight: 18, marginTop: S.sm },
  fieldRow: { flexDirection: 'row', paddingVertical: 8, borderTopWidth: 0.5, gap: S.sm },
  fieldKey: { fontSize: T.caption, width: 130 },
  fieldDesc: { flex: 1, fontSize: T.caption },
  actions: { flexDirection: 'row', gap: S.sm, marginTop: S.md },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: S.sm },
  busyText: { color: t.text3, fontSize: T.micro, flex: 1 },
  body: { color: t.text2, fontSize: T.caption, lineHeight: 21 },
}));
