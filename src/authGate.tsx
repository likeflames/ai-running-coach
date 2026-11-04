/* 登录门：没登录只显示登录页，登录后存 token，每个请求带 X-RC-Token。
 *
 * 分发版的规则
 * ------------
 * 1. 只有两条路：登录 / 注册（邀请码）。
 * 2. 没有「访问口令直接进」—— 那等于把部署者的账号借给别人。
 * 3. 登录成功后按会话代际重挂子树：切账号时所有页面 state 归零，
 *    不会把上一个人的建议、列表留在屏幕上。
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
import {
  authApi,
  getAccessToken,
  getSessionGeneration,
  registerLogoutHandler,
  registerTokenPrompt,
  setAccessToken,
} from './api';
import { R, S, T, type Theme } from './theme';
import { makeStyles, useTheme } from './theme-provider';

type Phase = 'checking' | 'login' | 'ready';
type Mode = 'login' | 'register';

export function TokenGate({ children }: { children: React.ReactNode }) {
  const th = useTheme();
  const s = useStyles();

  const [phase, setPhase] = useState<Phase>('checking');
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [invite, setInvite] = useState('');
  const [inviteRequired, setInviteRequired] = useState(true);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [bootError, setBootError] = useState('');

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const boot = useCallback(async () => {
    setBootError('');
    setPhase('checking');
    try {
      const st = await authApi.status();
      setRegistrationEnabled(st.registration_enabled !== false);
      setInviteRequired(st.invite_required !== false);
      if (getAccessToken()) {
        try {
          await authApi.me();
          setPhase('ready');
          return;
        } catch {
          /* token 过期或已被吊销，回登录页 */
        }
      }
      setMode('login');
      setPhase('login');
    } catch (e: any) {
      setBootError(e?.message || '连不上服务器，检查网络后重试');
      setMode('login');
      setPhase('login');
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  /* 用着用着 token 失效（90 天到期 / 改了密码 / 在别处退出）→ 回登录页 */
  useEffect(() => {
    registerTokenPrompt(() => {
      if (phaseRef.current === 'ready') setPhase('login');
      return Promise.resolve(null);
    });
    registerLogoutHandler(() => {
      setUsername('');
      setPassword('');
      setPassword2('');
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
    if (!username.trim() || !password) return setHint('用户名和密码都要填');

    if (mode === 'register') {
      if (!/^[A-Za-z0-9_]{3,30}$/.test(username.trim())) {
        return setHint('用户名只能用字母、数字、下划线，3-30 位');
      }
      if (password.length < 8) return setHint('密码至少 8 位');
      if (password !== password2) return setHint('两次输入的密码不一样');
      if (inviteRequired && !invite.trim()) return setHint('需要邀请码');
    }

    setBusy(true);
    try {
      const r =
        mode === 'register'
          ? await authApi.register(username.trim(), password, invite.trim())
          : await authApi.login(username.trim(), password);
      await setAccessToken(r.token);
      setPassword('');
      setPassword2('');
      setPhase('ready');
    } catch (e: any) {
      setHint(e?.message || (mode === 'register' ? '注册失败' : '登录失败'));
    } finally {
      setBusy(false);
    }
  }, [mode, username, password, password2, invite, inviteRequired]);

  // key 换成会话代际：切账号时整棵子树重建，旧 state 不会带过去
  if (phase === 'ready') {
    return <React.Fragment key={getSessionGeneration()}>{children}</React.Fragment>;
  }

  if (phase === 'checking') {
    return (
      <View style={[s.full, { backgroundColor: th.bg }]}>
        <ActivityIndicator color={th.text3} />
        <Text style={[s.checkingText, { color: th.text3 }]}>正在准备…</Text>
      </View>
    );
  }

  const isRegister = mode === 'register';
  const title = isRegister ? '创建账号' : '登录';
  const desc = isRegister
    ? '每个账号的数据互相独立，别人看不到你的训练和对话。'
    : '用你的账号登录，训练数据只有你自己能看到。';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.full, { backgroundColor: th.bg }]}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Text style={[s.brand, { color: th.text2 }]}>AI 跑步教练</Text>
        <Text style={[s.title, { color: th.text }]}>{title}</Text>
        <Text style={[s.desc, { color: th.text2 }]}>{desc}</Text>

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
          textContentType="username"
          style={[s.input, { backgroundColor: th.bgSoft, borderColor: th.borderSoft, color: th.text }]}
        />

        <TextInput
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (hint) setHint('');
          }}
          placeholder="密码"
          placeholderTextColor={th.text3}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType={isRegister ? 'newPassword' : 'password'}
          style={[s.input, { backgroundColor: th.bgSoft, borderColor: th.borderSoft, color: th.text }]}
        />

        {isRegister ? (
          <>
            <TextInput
              value={password2}
              onChangeText={(v) => {
                setPassword2(v);
                if (hint) setHint('');
              }}
              placeholder="再输一次密码"
              placeholderTextColor={th.text3}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType="newPassword"
              style={[s.input, { backgroundColor: th.bgSoft, borderColor: th.borderSoft, color: th.text }]}
            />
            {inviteRequired ? (
              <TextInput
                value={invite}
                onChangeText={(v) => {
                  setInvite(v);
                  if (hint) setHint('');
                }}
                placeholder="邀请码"
                placeholderTextColor={th.text3}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={[s.input, { backgroundColor: th.bgSoft, borderColor: th.borderSoft, color: th.text }]}
              />
            ) : null}
          </>
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
              {isRegister ? '创建并进入' : '登录'}
            </Text>
          )}
        </Pressable>

        <View style={s.links}>
          {registrationEnabled ? (
            <Pressable
              onPress={() => {
                setMode(isRegister ? 'login' : 'register');
                setHint('');
                setPassword('');
                setPassword2('');
              }}
            >
              <Text style={[s.link, { color: th.text2 }]}>
                {isRegister ? '已经有账号，去登录' : '第一次用？创建账号'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={boot}>
            <Text style={[s.link, { color: th.text3 }]}>连不上？重试</Text>
          </Pressable>
        </View>

        <Text style={[s.foot, { color: th.text3 }]}>
          训练与恢复数据仅用于生成训练建议，不替代医生诊断。
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  full: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  checkingText: { marginTop: S.md, fontSize: T.caption },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: S.xl, width: '100%', maxWidth: 420 },
  brand: { fontSize: T.caption, letterSpacing: 2, marginBottom: S.lg },
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
  foot: { fontSize: T.micro, lineHeight: 18, marginTop: S.xl, textAlign: 'center' },
}));
