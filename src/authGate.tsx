/* 访问口令校验：服务器返回 401 时自动弹出输入框，输对一次后永久记住。
 *
 * 口令存在 AsyncStorage 里，随每次请求以 X-RC-Token 头发给服务器。
 * 服务器没设口令（ACCESS_TOKEN 为空）时这个弹窗永远不会出现。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { registerTokenPrompt, setAccessToken } from './api';
import { R, S, T, alpha, type Theme } from './theme';
import { makeStyles, useTheme } from './theme-provider';

type Props = { children: React.ReactNode };

export function TokenGate({ children }: Props) {
  const th = useTheme();
  const s = useStyles();
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const waiters = useRef<Array<(v: string | null) => void>>([]);

  /** 弹出窗口，等用户给个结果（多个请求同时 401 时只弹一次，一起等同一个结果） */
  const ask = useCallback(() => {
    setVisible(true);
    setHint('');
    return new Promise<string | null>((resolve) => {
      waiters.current.push(resolve);
    });
  }, []);

  const settle = useCallback((value: string | null) => {
    setVisible(false);
    setInput('');
    setBusy(false);
    const list = waiters.current;
    waiters.current = [];
    list.forEach((fn) => fn(value));
  }, []);

  useEffect(() => {
    registerTokenPrompt(ask);
    return () => registerTokenPrompt(null);
  }, [ask]);

  const submit = useCallback(async () => {
    const v = input.trim();
    if (!v) {
      setHint('口令不能为空');
      return;
    }
    setBusy(true);
    await setAccessToken(v);
    // 不在这里判断对错：请求会带着新口令重试，还不对就会再弹一次
    settle(v);
  }, [input, settle]);

  return (
    <>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => settle(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[s.mask, { backgroundColor: th.dark ? 'rgba(0,0,0,0.68)' : 'rgba(20,24,30,0.42)' }]}
        >
          <View style={[s.card, { backgroundColor: th.card }]}>
            <Text style={s.title}>需要访问口令</Text>
            <Text style={s.desc}>
              这台服务器设了口令，输入一次以后就不用再输了。{'\n'}
              口令就是服务器配置文件里的 <Text style={s.code}>ACCESS_TOKEN</Text>。
            </Text>

            <TextInput
              value={input}
              onChangeText={(v) => {
                setInput(v);
                if (hint) setHint('');
              }}
              placeholder="请输入访问口令"
              placeholderTextColor={th.text3}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={[
                s.input,
                {
                  backgroundColor: th.bgSoft,
                  borderColor: th.borderSoft,
                  color: th.text,
                },
              ]}
              onSubmitEditing={submit}
              returnKeyType="done"
            />
            {hint ? <Text style={s.hint}>{hint}</Text> : null}

            <View style={s.row}>
              <Pressable
                onPress={() => settle(null)}
                style={({ pressed }) => [
                  s.btn,
                  { backgroundColor: th.bgSoft, opacity: pressed ? 0.72 : 1 },
                ]}
              >
                <Text style={[s.btnText, { color: th.text2 }]}>取消</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={busy}
                style={({ pressed }) => [
                  s.btn,
                  { backgroundColor: th.accent, opacity: pressed ? 0.82 : 1 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={th.accentInk} size="small" />
                ) : (
                  <Text style={[s.btnText, { color: th.accentInk, fontWeight: '600' }]}>确定</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((t: Theme) => ({
  mask: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: S.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: R.xl,
    padding: S.xl - 2,
    borderWidth: t.bordered ? StyleSheet.hairlineWidth : 0,
    borderColor: t.border,
  },
  title: {
    fontSize: T.title + 2,
    fontWeight: '600',
    color: t.text,
    letterSpacing: -0.3,
    marginBottom: S.sm,
  },
  desc: {
    fontSize: T.body2,
    lineHeight: 21,
    color: t.text2,
    marginBottom: S.lg,
  },
  code: {
    color: t.accent,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: T.caption,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    paddingVertical: 14,
    fontSize: 17,
  },
  hint: {
    marginTop: S.sm,
    fontSize: T.caption,
    color: t.bad,
  },
  row: {
    flexDirection: 'row',
    gap: S.sm + 2,
    marginTop: S.lg,
  },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: T.body + 1,
    fontWeight: '500',
  },
}));
