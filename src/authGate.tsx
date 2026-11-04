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
import { C, R, S } from './theme';

type Props = { children: React.ReactNode };

export function TokenGate({ children }: Props) {
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
          style={styles.mask}
        >
          <View style={styles.card}>
            <Text style={styles.title}>需要访问口令</Text>
            <Text style={styles.desc}>
              这台服务器设了口令，输入一次以后就不用再输了。{'\n'}
              口令就是服务器配置文件里的 <Text style={styles.code}>ACCESS_TOKEN</Text>。
            </Text>

            <TextInput
              value={input}
              onChangeText={(t) => {
                setInput(t);
                if (hint) setHint('');
              }}
              placeholder="请输入访问口令"
              placeholderTextColor={C.text3}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
              onSubmitEditing={submit}
              returnKeyType="done"
            />
            {hint ? <Text style={styles.hint}>{hint}</Text> : null}

            <View style={styles.row}>
              <Pressable
                onPress={() => settle(null)}
                style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
              >
                <Text style={styles.btnGhostText}>取消</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={busy}
                style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
              >
                {busy ? (
                  <ActivityIndicator color="#0f1115" size="small" />
                ) : (
                  <Text style={styles.btnPrimaryText}>确定</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: S.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: C.card,
    borderRadius: R.xl,
    padding: S.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    marginBottom: S.sm,
  },
  desc: {
    fontSize: 13,
    lineHeight: 20,
    color: C.text2,
    marginBottom: S.lg,
  },
  code: {
    color: C.accent,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  input: {
    backgroundColor: C.bgSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderSoft,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    paddingVertical: 13,
    fontSize: 16,
    color: C.text,
  },
  hint: {
    marginTop: S.sm,
    fontSize: 12,
    color: C.bad,
  },
  row: {
    flexDirection: 'row',
    gap: S.md,
    marginTop: S.lg,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: {
    backgroundColor: C.bgSoft,
  },
  btnGhostText: {
    fontSize: 15,
    color: C.text2,
    fontWeight: '500',
  },
  btnPrimary: {
    backgroundColor: C.accent,
  },
  btnPrimaryText: {
    fontSize: 15,
    color: '#0f1115',
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
});
