import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { api, chatStream, ChatEvent } from '../../../src/api';
import { Glass } from '../../../src/glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S, R, T, TNUM, alpha, type Theme } from '../../../src/theme';
import { makeStyles, useTheme } from '../../../src/theme-provider';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  thinking?: string;
  tool?: string;
  phase?: 'thinking' | 'answering' | 'done' | 'error';
  expanded?: boolean;
}

const QUICK = [
  '根据我今天的恢复数据，今天该练什么？',
  '明天练什么？为什么这么排',
  '分析一下我最近一次跑步表现怎么样，有什么问题',
  '帮我制定下周的训练计划',
  '我最近训练需要注意什么伤病风险？',
];

const TOOL_LABELS: Record<string, string> = {
  get_week_schedule: '正在查本周课表…',
  get_plan: '正在查自定义课表…',
  get_profile: '正在读你的档案…',
  update_profile: '正在更新档案…',
  set_plan_item: '正在写入课表…',
};

export default function ChatScreen() {
  const t = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  // 键盘弹起时输入栏贴着键盘，平时要让开底部的系统标签栏
  const [kbd, setKbd] = React.useState(false);
  React.useEffect(() => {
    const a = Keyboard.addListener('keyboardWillShow', () => setKbd(true));
    const b = Keyboard.addListener('keyboardWillHide', () => setKbd(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const draft = React.useRef<Msg | null>(null);
  const [, tick] = React.useState(0);
  const listRef = React.useRef<FlatList<Msg>>(null);
  const [meta, setMeta] = React.useState<{
    provider: string;
    model: string;
    calls: number;
    tokens: number;
  } | null>(null);

  // 顶部那行小字：当前模型 + 今天实际消耗的 token（后端每次调用都记账）
  const loadMeta = React.useCallback(() => {
    Promise.all([
      api.get<{ provider: string; model: string }>('/api/chat/model').catch(() => null),
      api
        .get<{ today_usage: { calls: number; total_tokens: number } }>('/api/chat/usage')
        .catch(() => null),
    ]).then(([m, u]) => {
      if (!m) return;
      setMeta({
        provider: m.provider,
        model: m.model,
        calls: u?.today_usage?.calls || 0,
        tokens: u?.today_usage?.total_tokens || 0,
      });
    });
  }, []);

  React.useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  // 流式输出很密（每字一个事件），统一 100ms 刷一次界面，避免卡顿
  React.useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(timer);
  }, [busy]);

  const onEvent = (ev: ChatEvent) => {
    const d = draft.current;
    if (!d) return;
    if (ev.t === 'reasoning') {
      d.thinking = (d.thinking || '') + (ev.d || '');
      d.phase = d.phase === 'answering' ? 'answering' : 'thinking';
    } else if (ev.t === 'content') {
      d.text += ev.d || '';
      d.phase = 'answering';
      d.tool = '';
    } else if (ev.t === 'tool') {
      d.tool = TOOL_LABELS[ev.d || ''] || `正在调用 ${ev.d}…`;
    } else if (ev.t === 'error') {
      d.text += `\n\n❌ ${ev.d || '出错了'}`;
      d.phase = 'error';
    }
  };

  const commit = (m: Msg) => {
    setMsgs((list) => [...list, m]);
    draft.current = null;
    tick((n) => n + 1);
  };

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput('');
    setBusy(true);

    const uid = `u${Date.now()}`;
    const userMsg: Msg = { id: uid, role: 'user', text: msg };
    setMsgs((list) => [...list, userMsg]);

    const aid = `a${Date.now()}`;
    draft.current = { id: aid, role: 'assistant', text: '', thinking: '', phase: 'thinking' };
    tick((n) => n + 1);

    let gotAny = false;
    try {
      await chatStream(msg, history_for(msg, msgs), (ev) => {
        if (ev.t === 'reasoning' || ev.t === 'content') gotAny = true;
        onEvent(ev);
      });
      const d = draft.current;
      if (d && !d.text.trim()) {
        d.text = d.phase === 'thinking' ? '（模型只输出了思考过程，没有给出正文，请再说一次或换个问法）' : '（无回复）';
      }
      if (d) d.phase = d.phase === 'error' ? 'error' : 'done';
      if (d) commit({ ...d });
    } catch (e: any) {
      // 流式不可用时退回普通接口
      if (!gotAny) {
        try {
          const data = await api.form<{ reply: string }>(
            '/api/chat',
            { message: msg, history: JSON.stringify(history_for(msg, msgs)) },
            120000
          );
          commit({ id: aid, role: 'assistant', text: data.reply || '（无回复）', phase: 'done' });
        } catch (e2: any) {
          commit({
            id: aid,
            role: 'assistant',
            text: '❌ 对话失败：' + (e2?.message || e?.message || '未知错误'),
            phase: 'error',
          });
        }
      } else {
        const d = draft.current;
        if (d) {
          d.text += `\n\n（连接中断：${e?.message || '未知错误'}）`;
          d.phase = 'error';
          commit({ ...d });
        }
      }
    } finally {
      setBusy(false);
      loadMeta();
    }
  };

  const anyOpen = Object.values(expanded).some(Boolean);
  const list = draft.current ? [...msgs, draft.current] : msgs;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <FlatList
        ref={listRef}
        data={list}
        keyExtractor={(m) => m.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: S.md, paddingBottom: S.lg }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListHeaderComponent={
          <View>
            {meta ? (
              <Pressable onPress={loadMeta} style={s.modelRow}>
                <Text style={s.modelText}>
                  {meta.provider === 'deepseek' ? 'DeepSeek' : meta.provider} · {meta.model}
                  {'　'}今日 {meta.calls} 次 ·{' '}
                  {meta.tokens >= 10000 ? `${(meta.tokens / 10000).toFixed(1)} 万` : meta.tokens}{' '}
                  tokens
                </Text>
              </Pressable>
            ) : null}
            {list.some((m) => m.thinking) ? (
              <Pressable
                onPress={() => {
                  if (anyOpen) {
                    setExpanded({});
                  } else {
                    const next: Record<string, boolean> = {};
                    list.forEach((m) => {
                      if (m.thinking) next[m.id] = true;
                    });
                    setExpanded(next);
                  }
                }}
                style={s.switchRow}
              >
                <Text style={s.switchText}>{anyOpen ? '收起全部思考' : '展开全部思考'}</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View>
            <Text style={s.welcome}>我是你的 AI 跑步教练</Text>
            <Text style={s.hint}>
              可以问我训练、恢复、配速、伤病、饮食等问题。我会先查你的真实数据和课表，再给出结论，并把思考过程摊开给你看。
            </Text>
            <View style={{ height: S.md }} />
            {QUICK.map((q) => (
              <Pressable key={q} onPress={() => send(q)} style={s.quick}>
                <Text style={s.quickText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        }
        renderItem={({ item }) => {
          if (item.role === 'user') {
            return (
              <View style={[s.bubble, s.userBubble]}>
                <Text style={[s.bubbleText, { color: t.accentInk }]}>{item.text}</Text>
              </View>
            );
          }
          const isStreaming = item.id === draft.current?.id;
          const open = expanded[item.id] ?? (isStreaming && item.phase === 'thinking');
          return (
            <View style={[s.bubble, s.aiBubble]}>
              {item.thinking ? (
                <Pressable
                  onPress={() => setExpanded((e) => ({ ...e, [item.id]: !open }))}
                  style={s.thinkHead}
                >
                  <Text style={s.thinkTitle}>思考过程 · {item.thinking.length} 字</Text>
                  <Text style={s.thinkToggle}>{open ? '收起 ▲' : '展开 ▼'}</Text>
                </Pressable>
              ) : null}

              {item.thinking && open ? (
                <View style={s.thinkBox}>
                  <Text style={s.thinkText}>{item.thinking}</Text>
                </View>
              ) : null}

              {item.thinking && !open ? (
                <Text style={s.thinkPeek} numberOfLines={1}>
                  {item.thinking.replace(/\s+/g, ' ').slice(-70)}
                </Text>
              ) : null}

              {item.tool ? <Text style={s.toolChip}>{item.tool}</Text> : null}

              {item.text ? (
                <Text style={s.bubbleText}>{item.text}</Text>
              ) : isStreaming ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <ActivityIndicator size="small" color={t.accent} />
                  <Text style={s.typingText}>{item.tool || '教练在思考…'}</Text>
                </View>
              ) : null}
            </View>
          );
        }}
      />

      {/*
        insets.bottom 在系统标签栏里已经包含了「标签栏 + Home 指示条」的高度，
        所以只要让它贴着安全区底边，输入栏就正好落在悬浮标签栏的上面，不再额外加数。
      */}
      <Glass style={[s.inputBar, { marginBottom: kbd ? 6 : insets.bottom + 8 }]}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="问点什么…"
          placeholderTextColor={t.text3}
          multiline
        />
        <Pressable
          onPress={() => send()}
          disabled={busy}
          style={[s.sendBtn, { backgroundColor: t.accent }, busy && { opacity: 0.5 }]}
        >
          <Text style={{ color: t.accentInk, fontWeight: '600', fontSize: T.body }}>{busy ? '…' : '发送'}</Text>
        </Pressable>
      </Glass>
    </KeyboardAvoidingView>
  );
}

/** 历史里要排除"本轮刚加进去的那条用户消息"，避免重复 */
function history_for(msg: string, msgs: Msg[]) {
  const arr = msgs
    .filter((m) => m.phase !== 'error')
    .map((m) => ({ role: m.role, content: m.text }));
  if (arr.length && arr[arr.length - 1].content === msg) arr.pop();
  return arr.slice(-12);
}

const useStyles = makeStyles((t: Theme) => ({
  welcome: { color: t.text, fontSize: T.title + 2, fontWeight: '600', letterSpacing: -0.3, marginBottom: 8 },
  hint: { color: t.text3, fontSize: T.caption, lineHeight: 21 },
  quick: {
    padding: S.md,
    borderRadius: R.md,
    backgroundColor: t.card,
    marginBottom: S.sm,
  },
  quickText: { color: t.text2, fontSize: T.body, lineHeight: 22 },
  bubble: { padding: S.md - 2, borderRadius: R.md, marginBottom: S.sm, maxWidth: '92%' },
  userBubble: { backgroundColor: t.accent, alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  aiBubble: {
    backgroundColor: t.card,
    borderBottomLeftRadius: 6,
    ...(t.bordered ? { borderWidth: StyleSheet.hairlineWidth, borderColor: t.border } : null),
  },
  bubbleText: { fontSize: T.body + 0.5, lineHeight: 24, color: t.text },
  switchRow: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4, marginBottom: 4 },
  modelRow: { paddingVertical: 6, paddingHorizontal: 4, marginBottom: 2 },
  modelText: { color: t.text3, fontSize: T.micro, ...TNUM },
  switchText: { color: t.text3, fontSize: T.micro + 1 },
  thinkHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  thinkTitle: { color: t.text3, fontSize: T.micro + 1, fontWeight: '600' },
  thinkToggle: { color: t.accent, fontSize: T.micro + 1 },
  thinkBox: {
    backgroundColor: t.bgSoft,
    borderRadius: R.xs,
    padding: S.sm + 2,
    marginBottom: S.sm,
    borderLeftWidth: 2,
    borderLeftColor: t.border,
  },
  thinkText: { color: t.text3, fontSize: T.micro + 1.5, lineHeight: 21 },
  thinkPeek: { color: t.text3, fontSize: T.micro + 1, marginBottom: S.sm, opacity: 0.7 },
  toolChip: { color: t.accent, fontSize: T.micro + 1, marginBottom: 7 },
  typingText: { color: t.text3, fontSize: T.caption },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: S.sm,
    padding: S.sm,
    marginHorizontal: S.md,
    borderRadius: R.lg,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    color: t.text,
    backgroundColor: t.card,
    borderRadius: R.sm,
    paddingHorizontal: S.md - 2,
    paddingVertical: 11,
    fontSize: T.body + 1,
  },
  sendBtn: {
    borderRadius: R.sm,
    paddingHorizontal: S.md + 2,
    paddingVertical: 12,
  },
}));
