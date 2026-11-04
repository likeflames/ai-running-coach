/* 登录门：没登录就只显示登录页，登录后存 token，随每个请求发 X-RC-Token。
 *
 * 三种入口
 * --------
 * 1. setup  —— 这台服务器上还没有任何账号，让用户创建第一个（继承现有数据）
 * 2. login  —— 用户名 + 密码
 * 3. legacy —— 老的服务器访问口令，给还没建账号的自己留的后路
 *
 * 为什么要「第一个账号继承 owner」
 * ------------------------------
 * 库里几百条佳明活动、记忆、跑鞋都挂在 owner 名下。第一个注册的人就是这些
 * 数据的主人，直接接管；第二个人开始才是全新的空账号。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { authApi, getAccessToken, registerLogoutHandler, registerTokenPrompt, setAccessToken } from './api';
import { R, S, T, type Theme } from './theme';
import { makeStyles, useTheme } from './theme-provider';

type Phase = 'checking' | 'login' | 'ready';
type Mode = 'setup' | 'login' | 'legacy';

export function TokenGate({ children }: { children: React.ReactNode }) {
  const th = useTheme();
  const s = useStyles();

  const [phase, setPhase] = useState<Phase>('checking');
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [bootError, setBootError] = useState('');

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  /* 启动时问服务器：有没有账号、我手里的 token 还有效吗 */
  const boot = useCallback(async () => {
    setBootError('');
    setPhase('checking');
    try {
      const st = await authApi.status();
      if (st.needs_setup) {
        setMode('setup');
        setPhase('login');
        return;
      }
      if (getAccessToken()) {
        try {
          await authApi.me();
          setPhase('ready');
          return;
        } catch {
          /* token 过期或口令变了，落到登录页 */
        }
      }
      setMode('login');
      setPhase('login');
    } catch (e: any) {
      // 连不上服务器时也给登录页，让用户能看到错误并重试
      setBootError(e?.message || '连不上服务器');
      setMode('login');
      setPhase('login');
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  /* 用着用着 token 失效（90 天到期 / 服务器换了密钥）→ 回到登录页 */
  useEffect(() => {
    registerTokenPrompt(() => {
      if (phaseRef.current === 'ready') setPhase('login');
      return Promise.resolve(null);
    });
    registerLogoutHandler(() => {
      setUsername('');
      setPassword('');
      setInvite('');
      setHint('');
      setMode('login');
      setPhase('login');
    });
    return () => {
      registerTokenPrompt(null);
      registerLogoutHandler(null);
    };
  }, []);

  const submit = useCallback(async () => {
    setHint('');
    if (mode === 'legacy') {
      const v = password.trim();
      if (!v) return setHint('请填写访问口令');
      setBusy(true);
      try {
        await setAccessToken(v);
        await authApi.me(); // 口令不对会 401
        setPhase('ready');
      } catch {
        setHint('访问口令不对');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'setup') {
      if (!/^[A-Za-z0-9_]{3,30}$/.test(username.trim())) {
        return setHint('用户名只能用字母、数字、下划线，3-30 位');
      }
      if (password.length < 6) return setHint('密码至少 6 位');
      setBusy(true);
      try {
        const r = await authApi.register(username.trim(), password, invite.trim());
        await setAccessToken(r.token);
        setPhase('ready');
      } catch (e: any) {
        setHint(e?.message || '创建失败');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!username.trim() || !password) return setHint('用户名和密码都要填');
    setBusy(true);
    try {
      const r = await authApi.login(username.trim(), password);
      await setAccessToken(r.token);
      setPhase('ready');
    } catch (e: any) {
      setHint(e?.message || '登录失败');
    } finally {
      setBusy(false);
    }
  }, [mode, username, password, invite]);

  if (phase === 'ready') return <>{children}</>;

  if (phase === 'checking') {
    return (
      <View style={[s.full, { backgroundColor: th.bg }]}>
        <ActivityIndicator color={th.text3} />
        <Text style={[s.checkingText, { color: th.text3 }]}>正在连接服务器…</Text>
      </View>
    );
  }

  const title =
    mode === 'setup' ? '创建第一个账号' : mode === 'legacy' ? '用访问口令进入' : '登录';
  const desc =
    mode === 'setup'
      ? '这台服务器还没有账号。第一个账号会接管已有的全部训练数据（佳明同步下来的活动、记忆、跑鞋）。'
      : mode === 'legacy'
        ? '口令就是服务器配置文件里的 ACCESS_TOKEN。适合还没建账号的自己先用着。'
        : '用你在这台服务器上注册的账号登录。';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.full, { backgroundColor: th.bg }]}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[s.brand, { color: th.text }]}>AI 跑步教练</Text>
        <Text style={[s.title, { color: th.text }]}>{title}</Text>
        <Text style={[s.desc, { color: th.text2 }]}>{desc}</Text>

        {mode !== 'legacy' ? (
          <TextInput
            value={username}
            onChangeText={(v) => {
              setUsername(v);
              if (hint) setHint('');
            }}
            placeholder="用户名"
            placeholderTextColor={th.text3}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            style={[s.input, { backgroundColor: th.bgSoft, borderColor: th.borderSoft, color: th.text }]}
          />
        ) : null}

        <TextInput
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (hint) setHint('');
          }}
          placeholder={mode === 'legacy' ? '访问口令' : '密码'}
          placeholderTextColor={th.text3}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={[s.input, { backgroundColor: th.bgSoft, borderColor: th.borderSoft, color: th.text }]}
        />

        {mode === 'setup' ? (
          <TextInput
            value={invite}
            onChangeText={(v) => {
              setInvite(v);
              if (hint) setHint('');
            }}
            placeholder="邀请码（服务器访问口令）"
            placeholderTextColor={th.text3}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={[s.input, { backgroundColor: th.bgSoft, borderColor: th.borderSoft, color: th.text }]}
          />
        ) : null}

        {hint ? <Text style={[s.hint, { color: th.bad }]}>{hint}</Text> : null}
        {bootError ? <Text style={[s.hint, { color: th.warn }]}>{bootError}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={busy}
          style={({ pressed }) => [
            s.primary,
            { backgroundColor: th.accent, opacity: pressed || busy ? 0.82 : 1 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={th.accentInk} size="small" />
          ) : (
            <Text style={[s.primaryText, { color: th.accentInk }]}>
              {mode === 'setup' ? '创建并进入' : '登录'}
            </Text>
          )}
        </Pressable>

        <View style={s.links}>
          {mode === 'login' ? (
            <Pressable onPress={() => { setMode('legacy'); setHint(''); setPassword(''); }}>
              <Text style={[s.link, { color: th.text3 }]}>只有访问口令？点这里</Text>
            </Pressable>
          ) : null}
          {mode === 'legacy' ? (
            <Pressable onPress={() => { setMode('login'); setHint(''); setPassword(''); }}>
              <Text style={[s.link, { color: th.text3 }]}>返回账号登录</Text>
            </Pressable>
          ) : null}
          {mode === 'setup' ? (
            <Pressable onPress={() => { setMode('login'); setHint(''); }}>
              <Text style={[s.link, { color: th.text3 }]}>已经有账号了</Text>
            </Pressable>
          ) : null}
          {mode === 'login' ? (
            <Pressable onPress={boot}>
              <Text style={[s.link, { color: th.text3 }]}>重试连接</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  full: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  checkingText: { marginTop: S.md, fontSize: T.caption },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: S.xl, width: '100%', maxWidth: 420 },
  brand: { fontSize: T.caption, letterSpacing: 2, opacity: 0.5, marginBottom: S.lg },
  title: { fontSize: T.title + 4, fontWeight: '700', letterSpacing: -0.5, marginBottom: S.sm },
  desc: { fontSize: T.body2, lineHeight: 21, marginBottom: S.lg },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    paddingVertical: 14,
    fontSize: 17,
    marginBottom: S.sm + 2,
  },
  hint: { fontSize: T.caption, marginTop: 2, marginBottom: S.sm },
  primary: {
    height: 52,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: S.md,
  },
  primaryText: { fontSize: T.body + 1, fontWeight: '600' },
  links: { marginTop: S.lg, gap: S.sm, alignItems: 'center' },
  link: { fontSize: T.caption },
}));
