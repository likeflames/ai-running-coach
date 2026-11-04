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
  Animated,
  Easing,
} from 'react-native';
import { api, chatStream, ChatEvent } from '../../../src/api';
import { Markdown } from '../../../src/markdown';
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
}

/** 流式期间最多多久把缓冲的文字刷到界面一次。token 到得比这更密，合并掉 */
const PUSH_MS = 110;

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
    const a = Keyboard.addListener('keyboardWillShow', () => {
      setKbd(true);
      // 键盘把列表压矮后底部内容会被裁掉，跟着贴一次底
      follow.current = true;
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
    });
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

  /** 正在输出的那条单独放 state，历史消息不跟着重渲染 */
  const [live, setLive] = React.useState<Msg | null>(null);
  /** 逐 token 累积在 ref 里，不进 React —— 否则每个字都要渲染一次 */
  const draft = React.useRef<Msg | null>(null);
  const lastPush = React.useRef(0);
  /** 用户是否停在底部。滑上去看历史时就别再抢滚动位置 */
  const follow = React.useRef(true);
  /** 手指是否正按在列表上（只有这种情况才更新 follow） */
  const touching = React.useRef(false);

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

  /** 把 ref 里的草稿节流刷到界面。只在内容真变了才 setState */
  const push = React.useCallback((force = false) => {
    const d = draft.current;
    if (!d) return;
    const now = Date.now();
    if (!force && now - lastPush.current < PUSH_MS) return;
    lastPush.current = now;
    setLive({ ...d });
  }, []);

  const onEvent = React.useCallback(
    (ev: ChatEvent) => {
      const d = draft.current;
      if (!d) return;
      if (ev.t === 'reasoning') {
        d.thinking = (d.thinking || '') + (ev.d || '');
        if (d.phase !== 'answering') d.phase = 'thinking';
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
      push();
    },
    [push]
  );

  const commit = React.useCallback((m: Msg) => {
    draft.current = null;
    setLive(null);
    setMsgs((list) => [...list, m]);
    follow.current = true;
  }, []);

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
    lastPush.current = 0;
    follow.current = true;
    push(true);
    // 刚发出消息：等两帧再贴底，确保新气泡已经量完高度
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    });

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

  const toggleThink = React.useCallback((id: string) => {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }, []);

  // 只有消息或正在输出的草稿变了才重建，别的 state 不会牵动整个列表
  const data = React.useMemo(() => (live ? [...msgs, live] : msgs), [msgs, live]);

  // 「展开全部思考」只统计已经说完的消息 —— 流式期间不出现/消失，避免顶部跳动
  const thinkingMsgs = msgs.filter((m) => m.thinking);
  const allOpen = thinkingMsgs.length > 0 && thinkingMsgs.every((m) => expanded[m.id]);

  const renderItem = React.useCallback(
    ({ item }: { item: Msg }) => (
      <Bubble item={item} open={!!expanded[item.id]} onToggle={toggleThink} />
    ),
    [expanded, toggleThink]
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(m) => m.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: S.md, paddingBottom: S.lg }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        /*
         * 贴底用非动画：原来每次内容长高都调 scrollToEnd({ animated: true })，
         * 上一个动画还没跑完下一个又来了，几个动画抢同一个滚动位置，看着就是一抖一抖。
         *
         * 补两帧是因为内容刚插进去时高度还没测量完，滚一次会停在旧位置 ——
         * 表现就是「发完消息直接跳回上面」。
         */
        onContentSizeChange={() => {
          if (!follow.current) return;
          listRef.current?.scrollToEnd({ animated: false });
          requestAnimationFrame(() => {
            if (follow.current) listRef.current?.scrollToEnd({ animated: false });
          });
        }}
        onScrollBeginDrag={() => {
          touching.current = true;
        }}
        onMomentumScrollBegin={() => {
          touching.current = true;
        }}
        /*
         * 只有「手指拖动」才算用户想离开底部。
         * 键盘弹起会把列表压矮，这时候 onScroll 也会触发，
         * 旧写法会被误判成"用户滑走了"，之后就再也不跟随 —— 这才是跳顶部的根因。
         */
        onScroll={(e) => {
          if (!touching.current) return;
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const gap = contentSize.height - contentOffset.y - layoutMeasurement.height;
          follow.current = gap < 120;
        }}
        onScrollEndDrag={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          follow.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 120;
          touching.current = false;
        }}
        onMomentumScrollEnd={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          follow.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 120;
          touching.current = false;
        }}
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
            {thinkingMsgs.length > 0 ? (
              <Pressable
                onPress={() => {
                  if (allOpen) {
                    setExpanded({});
                  } else {
                    const next: Record<string, boolean> = {};
                    thinkingMsgs.forEach((m) => {
                      next[m.id] = true;
                    });
                    setExpanded(next);
                  }
                }}
                style={s.switchRow}
              >
                <Text style={s.switchText}>{allOpen ? '收起全部思考' : '展开全部思考'}</Text>
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
        renderItem={renderItem}
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

/**
 * 一条消息。用 memo 包住 —— 流式时只有正在输出的那一条重渲染，
 * 上面几十条历史气泡不动，这是「不抖」的另一半原因。
 */
const Bubble = React.memo(function Bubble({
  item,
  open,
  onToggle,
}: {
  item: Msg;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const t = useTheme();
  const s = useStyles();

  if (item.role === 'user') {
    return (
      <View style={[s.bubble, s.userBubble]}>
        <Text style={[s.bubbleText, { color: t.accentInk }]}>{item.text}</Text>
      </View>
    );
  }

  const streaming = item.phase === 'thinking' || item.phase === 'answering';

  return (
    <View style={[s.bubble, s.aiBubble]}>
      {item.thinking ? (
        <ThinkBlock text={item.thinking} open={open} onToggle={() => onToggle(item.id)} />
      ) : null}

      {item.tool ? <Text style={s.toolChip}>{item.tool}</Text> : null}

      {item.text ? (
        <Markdown text={item.text} />
      ) : streaming ? (
        <View style={s.thinkingRow}>
          <ActivityIndicator size="small" color={t.accent} />
          <Text style={s.typingText}>{item.tool || '教练在思考…'}</Text>
        </View>
      ) : null}
    </View>
  );
});

/**
 * 思考过程：默认收起成一行「思考中 · 328 字」。
 *
 * 之前是流式时默认摊开，内容一长就把整页往下推，配合自动滚动就成了抖动。
 * 收起后高度恒定；想看随时点开，点开的高度变化是你自己触发的，不会突然跳。
 */
function ThinkBlock({ text, open, onToggle }: { text: string; open: boolean; onToggle: () => void }) {
  const s = useStyles();
  const anim = React.useRef(new Animated.Value(open ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [open, anim]);

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <View>
      <Pressable onPress={onToggle} hitSlop={10} style={s.thinkHead}>
        <Text style={s.thinkTitle}>
          {open ? '思考过程' : '思考中'} · {text.length} 字
        </Text>
        <Animated.Text style={[s.thinkChev, { transform: [{ rotate }] }]}>›</Animated.Text>
      </Pressable>
      {open ? (
        <View style={s.thinkBox}>
          <Markdown text={text} compact />
        </View>
      ) : null}
    </View>
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
  thinkHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  thinkTitle: { flex: 1, color: t.text3, fontSize: T.micro + 1, fontWeight: '600' },
  thinkChev: { color: t.text3, fontSize: T.caption + 2, fontWeight: '500', marginTop: -2 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  thinkBox: {
    backgroundColor: t.bgSoft,
    borderRadius: R.xs,
    padding: S.sm + 2,
    marginBottom: S.sm,
    borderLeftWidth: 2,
    borderLeftColor: t.border,
  },
  thinkText: { color: t.text3, fontSize: T.micro + 1.5, lineHeight: 21 },
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
