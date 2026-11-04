/* 通用 UI 组件：卡片、区块、指标、按钮、加载/错误/空状态 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  RefreshControl,
} from 'react-native';
import { C, R, S } from './theme';

export function Screen({
  children,
  refreshing,
  onRefresh,
  noTabBar,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** 不在标签页里时传 true：底部不用给系统标签栏留位置 */
  noTabBar?: boolean;
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      // automatic：让系统按安全区自动留白。iOS 上会把导航栏高度、底部标签栏高度都算进去，
      // 内容才不会钻到导航栏底下、也不会被悬浮标签栏压住。
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: S.md, paddingBottom: noTabBar ? 24 : 16 }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.accent} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <View style={{ marginBottom: S.lg }}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Stat({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  color?: string;
}) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, color ? { color } : null]} numberOfLines={1}>
        {value === null || value === undefined || value === '' ? '-' : value}
        {unit ? <Text style={s.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

export function Row({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export function Pill({ text, color }: { text: string; color?: string }) {
  return (
    <View style={[s.pill, { borderColor: (color || C.accent) + '66', backgroundColor: (color || C.accent) + '18' }]}>
      <Text style={{ color: color || C.accent, fontSize: 11, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Btn({
  title,
  onPress,
  color,
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        small && { paddingVertical: 6, paddingHorizontal: 10 },
        { borderColor: (color || C.accent) + '88', backgroundColor: (color || C.accent) + (pressed ? '33' : '1a') },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={{ color: color || C.accent, fontWeight: '600', fontSize: small ? 12 : 14 }}>{title}</Text>
    </Pressable>
  );
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <View style={s.center}>
      <ActivityIndicator color={C.accent} />
      <Text style={{ color: C.text3, marginTop: S.sm, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: C.bad + '66' }}>
      <Text style={{ color: C.bad, fontSize: 13, marginBottom: S.sm }}>⚠️ {message}</Text>
      {onRetry ? <Btn title="重试" onPress={onRetry} small /> : null}
    </Card>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <Card>
      <Text style={{ color: C.text3, fontSize: 13, textAlign: 'center', paddingVertical: S.md }}>{text}</Text>
    </Card>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: R.md,
    padding: S.md,
    marginBottom: S.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.sm,
  },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  stat: { flex: 1, minWidth: 76, paddingVertical: 6 },
  statLabel: { color: C.text3, fontSize: 11, marginBottom: 3 },
  statValue: { color: C.text, fontSize: 17, fontWeight: '600' },
  statUnit: { color: C.text3, fontSize: 11, fontWeight: '400' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  rowLabel: { color: C.text2, fontSize: 13 },
  rowValue: { color: C.text, fontSize: 13, fontWeight: '500' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start' },
  btn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: R.sm, borderWidth: 1, alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 30 },
});
