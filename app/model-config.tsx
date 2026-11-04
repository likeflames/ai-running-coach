import React from 'react';
import { View, Text } from 'react-native';
import { api } from '../src/api';
import { Screen, Section, Card, Pill, Hint, Loading, ErrorBox } from '../src/ui';
import { S, T, type Theme } from '../src/theme';
import { makeStyles, useTheme } from '../src/theme-provider';

/**
 * 教练服务状态页
 *
 * 对话用的模型由服务端统一提供，用户不需要也不应该配置 key。
 * 这里只回答一个问题：现在能不能聊。不能聊的时候给一句人话，而不是报错码。
 */

interface LlmStatus {
  configured: boolean;
  reasoning?: boolean;
}

export default function CoachServiceScreen() {
  const t = useTheme();
  const s = useStyles();

  const [data, setData] = React.useState<LlmStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<LlmStatus>('/api/settings/llm');
      setData(d);
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

  if (loading) return <Loading />;
  if (err)
    return (
      <Screen noTabBar>
        <ErrorBox message={err} onRetry={load} />
      </Screen>
    );

  const ok = !!data?.configured;

  return (
    <Screen noTabBar>
      <Text style={s.lead}>
        教练对话由服务端统一接入的模型驱动。你不需要填任何 Key，也不用为对话单独付费。
      </Text>

      <Section title="当前状态">
        <Card>
          <View style={s.nowRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.nowTitle}>{ok ? '可以正常对话' : '暂时不可用'}</Text>
              <Text style={s.nowSub}>
                {ok ? '直接回到「教练」页提问就行。' : '服务端还没配好模型，稍后再试。'}
              </Text>
            </View>
            <Pill text={ok ? '正常' : '不可用'} color={ok ? t.good : t.bad} />
          </View>
        </Card>
      </Section>

      <Section title="每天有额度">
        <Card>
          <Text style={s.body}>
            为了防止一个人把额度跑满、所有人跟着卡住，每个账号每天有对话次数和字数的上限。
            额度按自然日（北京时间）重置，第二天自动恢复。
          </Text>
          <Text style={s.body}>
            如果聊到一半提示「今天的教练额度用完了」，不是出故障，等明天就好。
            想省额度的话，让它一次把问题说清楚，比来回追问更划算。
          </Text>
        </Card>
      </Section>

      <Hint label="为什么不让每个人自己填 Key？">
        自己填 Key 意味着每个人的对话要自己去模型厂商开户、充值、维护。
        对只想跑步的人来说这是纯粹的负担，而且一旦 Key 失效，App 会以最难懂的方式坏掉。
        现在由服务端统一接入，你只需要跑步和提问。
      </Hint>

      <Hint label="对话内容会被拿去训练吗？">
        不会。请求只发给你正在用的模型服务，用来生成这一条回答；
        服务端只在数据库里记「谁在哪天用了多少次、多少字」，不保存对话正文之外的用途。
      </Hint>
    </Screen>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  lead: { color: t.text3, fontSize: T.caption, lineHeight: 20, marginBottom: S.md },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  nowTitle: { color: t.text, fontSize: T.body, fontWeight: '600', letterSpacing: -0.2 },
  nowSub: { color: t.text3, fontSize: T.caption, marginTop: 3, lineHeight: 19 },
  body: { color: t.text2, fontSize: T.caption, lineHeight: 21, marginBottom: S.sm },
}));
