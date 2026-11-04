import React from 'react';
import { View, Text, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../src/api';
import { Screen, Section, Card, Field, Btn, Pill, Hint, Loading, ErrorBox } from '../src/ui';
import { S, T, type Theme } from '../src/theme';
import { makeStyles, useTheme } from '../src/theme-provider';

/**
 * 模型配置页
 *
 * 这是「用户自带 key」的入口：谁的对话花谁的钱，key 只存在自己的账号下。
 * 表单里所有输入框默认留空 —— 空表示「不改」，已有配置以灰字提示显示，
 * 这样既不会把明文回显到屏幕上，也不会让人以为配置丢了。
 */

interface ActiveConfig {
  provider: string;
  provider_label: string;
  model: string;
  base_url: string;
  api_key_masked: string;
  key_source: 'self' | 'platform' | 'env' | 'none';
  configured: boolean;
  reasoning: boolean;
}

interface ProviderOption {
  id: string;
  name: string;
  base_url: string;
  model: string;
  key_url: string;
}

interface LlmSettings {
  active: ActiveConfig;
  providers: ProviderOption[];
  overrides: string[];
  platform_configured: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  self: '你自己填的',
  platform: '平台默认',
  env: '服务器配置',
  none: '还没配',
};

export default function ModelConfigScreen() {
  const t = useTheme();
  const s = useStyles();
  const router = useRouter();

  const [data, setData] = React.useState<LlmSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; msg: string } | null>(null);

  const [provider, setProvider] = React.useState('deepseek');
  const [apiKey, setApiKey] = React.useState('');
  const [model, setModel] = React.useState('');
  const [baseUrl, setBaseUrl] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<LlmSettings>('/api/settings/llm');
      setData(d);
      setProvider(d.active.provider);
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

  const current = data?.providers.find((p) => p.id === provider);
  const isCustom = provider === 'custom';

  const pick = (id: string) => {
    setProvider(id);
    // 换服务商时清掉上一家的模型名和地址，避免拿着 OpenAI 的模型名去请求 DeepSeek
    setModel('');
    setBaseUrl('');
    setResult(null);
  };

  const save = async (withTest: boolean) => {
    setBusy(true);
    setResult(null);
    try {
      const body: Record<string, any> = { provider, test: withTest };
      if (apiKey.trim()) body.api_key = apiKey.trim();
      if (model.trim()) body.model = model.trim();
      if (baseUrl.trim()) body.base_url = baseUrl.trim();

      const r = await api.put<{ ok: boolean; active: ActiveConfig; test?: { ok: boolean; reply?: string; error?: string } }>(
        '/api/settings/llm',
        body,
        60000
      );
      setData((d) => (d ? { ...d, active: r.active } : d));
      setApiKey('');
      setModel('');
      setBaseUrl('');

      if (r.test) {
        setResult(
          r.test.ok
            ? { ok: true, msg: `已保存，测试通过：${r.test.reply || '模型有回应'}` }
            : { ok: false, msg: `已保存，但测试没通过：${r.test.error || '未知错误'}` }
        );
      } else {
        setResult({ ok: true, msg: '已保存' });
      }
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message || '保存失败' });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    Alert.alert(
      '清除自己的模型设置',
      '清除后回到平台默认或服务器配置。你自己的 key 会从数据库里删掉。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await api.put('/api/settings/llm', {
                provider: '',
                api_key: '',
                base_url: '',
                model: '',
                test: false,
              });
              await load();
              setResult({ ok: true, msg: '已清除' });
            } catch (e: any) {
              setResult({ ok: false, msg: e?.message || '清除失败' });
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

  const a = data!.active;

  return (
    <Screen noTabBar>
      <Text style={s.lead}>
        对话用哪个模型由你决定。填自己的 API Key 就用你自己的额度，费用直接结算给模型厂商，不经过这台服务器。
      </Text>

      <Section title="当前生效">
        <Card>
          <View style={s.nowRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.nowModel}>
                {a.provider_label} · {a.model}
              </Text>
              <Text style={s.nowSub}>
                Key {a.api_key_masked ? `尾号 ${a.api_key_masked.slice(-4)}` : '未配置'} ·{' '}
                {SOURCE_LABEL[a.key_source] || a.key_source}
              </Text>
            </View>
            <Pill
              text={a.configured ? '可用' : '不可用'}
              color={a.configured ? t.good : t.bad}
            />
          </View>
          {a.reasoning ? (
            <Text style={s.nowNote}>这个模型会输出思考过程，对话里可以展开看它怎么想的。</Text>
          ) : null}
        </Card>
      </Section>

      <Section title="选择服务商">
        <Card style={{ padding: 0 }}>
          {data!.providers.map((p, i) => {
            const on = p.id === provider;
            return (
              <View key={p.id}>
                {i > 0 ? <View style={[s.line, { backgroundColor: t.border }]} /> : null}
                <Text
                  onPress={() => pick(p.id)}
                  style={[s.optionRow, { color: on ? t.accent : t.text }]}
                >
                  {p.name}
                  {on ? '  ✓' : ''}
                </Text>
              </View>
            );
          })}
        </Card>
      </Section>

      <Section title="配置">
        <Field
          label="API Key"
          value={apiKey}
          onChangeText={setApiKey}
          placeholder={
            a.key_source === 'self' && a.api_key_masked
              ? `已保存（${a.api_key_masked}），留空则不修改`
              : 'sk-...'
          }
          secure
          hint={
            current?.key_url
              ? `在 ${current.key_url} 创建。留空表示沿用当前配置。`
              : '填 OpenAI 兼容服务的 Key。留空表示沿用当前配置。'
          }
        />

        {isCustom ? (
          <Field
            label="接口地址 Base URL"
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder={a.base_url || 'https://your-host/v1'}
            keyboardType="url"
            hint="必须是 OpenAI 兼容接口，通常以 /v1 结尾。硅基流动、月之暗面、智谱、自建 vLLM 都选这里。"
          />
        ) : null}

        <Field
          label="模型名"
          value={model}
          onChangeText={setModel}
          placeholder={a.provider === provider ? a.model : current?.model || '模型名'}
          hint="留空用该服务商的默认模型。想要思维过程就选带 pro / reasoner / thinking 的型号。"
        />

        <View style={s.actions}>
          <Btn
            title={busy ? '保存中…' : '保存并测试'}
            onPress={() => save(true)}
            disabled={busy}
            primary
          />
        </View>
        <View style={[s.actions, { marginTop: S.sm }]}>
          <Btn title="只保存" onPress={() => save(false)} disabled={busy} small />
          <Btn title="清除我的设置" onPress={reset} disabled={busy} small color={t.bad} />
        </View>
        {busy ? (
          <View style={s.busyRow}>
            <ActivityIndicator color={t.text3} />
            <Text style={s.busyText}>正在验证…</Text>
          </View>
        ) : null}
        {result ? (
          <Text style={[s.result, { color: result.ok ? t.good : t.bad }]}>{result.msg}</Text>
        ) : null}
      </Section>

      <Hint label="Key 存在哪，安全吗？">
        存在服务器数据库里，用 AES 加密（Fernet），密钥文件在 data 目录，只有容器能读到。
        接口永远不会把完整 key 回传，你自己在 App 里也只能看到尾号。
        {'\n\n'}
        如果你不想把 key 交给这台服务器，另一个办法是在「设置」里清除自己的配置，
        让服务端用它自己的 key —— 代价是费用由服务端承担。
      </Hint>

      <Hint label="为什么让我自己填？">
        分享给别人用的时候，每个人的对话量不一样。如果都用服务端那一把 key，
        成本和额度是谁也说不清的糊涂账。自己填自己的，账目清楚，也省得一个人跑满额度全员瘫痪。
      </Hint>
    </Screen>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  lead: { color: t.text3, fontSize: T.caption, lineHeight: 20, marginBottom: S.md },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  nowModel: { color: t.text, fontSize: T.body, fontWeight: '600', letterSpacing: -0.2 },
  nowSub: { color: t.text3, fontSize: T.caption, marginTop: 3 },
  nowNote: { color: t.text3, fontSize: T.micro, lineHeight: 18, marginTop: S.sm },
  optionRow: {
    fontSize: T.body,
    paddingHorizontal: S.md,
    paddingVertical: 14,
  },
  line: { height: 0.5, marginLeft: S.md },
  actions: { flexDirection: 'row', gap: S.sm, marginTop: S.sm },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: S.sm },
  busyText: { color: t.text3, fontSize: T.caption },
  result: { fontSize: T.caption, lineHeight: 19, marginTop: S.sm },
}));
