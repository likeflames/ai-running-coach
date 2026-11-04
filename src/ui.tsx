/**
 * 通用 UI 组件 —— 按 iOS 系统控件重做
 *
 * 关键的三条规则（也是"像苹果自带 App"的全部秘密）：
 *  1. 分组列表：内容在白色圆角卡片里，卡片之间留大片空白，组与组之间用 13pt 灰字当标题
 *  2. 分割线从左侧 16pt 开始，不通到边（inset separator）
 *  3. 正文 17pt，次要文字压到 13pt 并降对比度，层级靠这个，不靠颜色
 */
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
  RefreshControl,
  type TextStyle,
} from 'react-native';
import { R, S, T, TNUM, alpha, type Theme } from './theme';
import { makeStyles, useTheme } from './theme-provider';

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
  const t = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      // automatic：让系统按安全区自动留白。配大标题导航栏时才会算对顶部 inset。
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: S.md, paddingTop: S.sm, paddingBottom: noTabBar ? 40 : 28 }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.text2} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

/** 圆角卡片。tint 传颜色时整张卡染一层极淡的色，比描边克制 */
export function Card({
  children,
  style,
  tint,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  tint?: string;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: tint ? alpha(tint, t.dark ? 0.11 : 0.07) : t.card,
          borderRadius: R.lg,
          padding: S.md,
          marginBottom: S.sm + 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * 分组。标题是 13pt 灰字（跟系统设置里的分组标题一样），
 * 不是原来那种 18pt 粗体 —— 粗体标题会把视线从内容上抢走。
 */
export function Section({
  title,
  right,
  children,
  desc,
}: {
  title?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  desc?: string;
}) {
  const s = useStyles();
  return (
    <View style={{ marginTop: S.lg, marginBottom: S.xs }}>
      {title ? (
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      {desc ? <Text style={s.sectionDesc}>{desc}</Text> : null}
      {children}
    </View>
  );
}

/** 卡片内的小标题 + 右侧操作 */
export function CardHead({ title, right, sub }: { title: string; right?: React.ReactNode; sub?: string }) {
  const s = useStyles();
  return (
    <View style={s.cardHead}>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{title}</Text>
        {sub ? <Text style={s.cardSub}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/**
 * 分组列表容器：子项之间自动插缩进分割线，最后一项不画。
 * 用它就能做出「设置」那种一整个圆角块里多行的效果。
 */
export function List({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ backgroundColor: t.card, borderRadius: R.lg, overflow: 'hidden' }, style]}>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {child}
          {i < items.length - 1 ? (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: S.md }} />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}

/** 列表行：左标题（可带说明），右侧值 / 开关 / 箭头 */
export function ListRow({
  title,
  sub,
  value,
  right,
  onPress,
  chevron,
}: {
  title: string;
  sub?: string;
  value?: string | number;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const t = useTheme();
  const s = useStyles();
  const body = (
    <View style={s.listRow}>
      <View style={{ flex: 1, paddingRight: S.sm }}>
        <Text style={s.listTitle}>{title}</Text>
        {sub ? <Text style={s.listSub}>{sub}</Text> : null}
      </View>
      {value !== undefined ? <Text style={s.listValue}>{value}</Text> : null}
      {right}
      {chevron ? (
        <Text style={[s.chevron, { color: t.text3 }]}>›</Text>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { backgroundColor: t.bgSoft } : null)}>
      {body}
    </Pressable>
  );
}

/** iOS 分段控件 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: t.dark ? 'rgba(118,118,128,0.24)' : 'rgba(120,120,128,0.12)',
        borderRadius: 9,
        padding: 2,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              paddingVertical: 6,
              borderRadius: 7,
              alignItems: 'center',
              backgroundColor: on ? (t.dark ? '#636366' : '#FFFFFF') : 'transparent',
              ...(on && !t.dark
                ? { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } }
                : null),
            }}
          >
            <Text
              style={{
                fontSize: T.caption,
                fontWeight: on ? '600' : '500',
                color: on ? t.text : t.text2,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 强调色选择：一排系统色圆点，选中的画一圈外环 */
export function ColorDots({
  colors,
  value,
  onChange,
}: {
  colors: { id: string; color: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
      {colors.map((c) => {
        const on = c.id === value;
        return (
          <Pressable key={c.id} onPress={() => onChange(c.id)} hitSlop={6}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2.5,
                borderColor: on ? c.color : 'transparent',
              }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.color }} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 指标：标签在上、数字在下。big 用于页面主角 */
export function Stat({
  label,
  value,
  unit,
  color,
  big,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  color?: string;
  big?: boolean;
}) {
  const s = useStyles();
  const empty = value === null || value === undefined || value === '';
  return (
    <View style={s.stat}>
      <Text style={s.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[big ? s.statBig : s.statValue, color ? { color } : null]} numberOfLines={1}>
        {empty ? '–' : value}
        {unit && !empty ? <Text style={s.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

/** 一行「标签 …… 数值」 */
export function Row({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={[s.row, { borderBottomColor: t.border }]}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.rowDots} />
      <Text style={[s.rowValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

/** 小标签胶囊 */
export function Pill({ text, color }: { text: string; color?: string }) {
  const t = useTheme();
  const c = color || t.accent;
  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: R.pill,
        backgroundColor: alpha(c, t.dark ? 0.2 : 0.13),
      }}
    >
      <Text style={{ color: c, fontSize: T.micro, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

/** 按钮。primary = 实心强调色（一屏最多一个），默认是 iOS 的柔和次按钮 */
export function Btn({
  title,
  onPress,
  color,
  disabled,
  small,
  primary,
}: {
  title: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  small?: boolean;
  primary?: boolean;
}) {
  const t = useTheme();
  const s = useStyles();
  const c = color || t.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        {
          backgroundColor: primary ? c : t.dark ? 'rgba(118,118,128,0.24)' : 'rgba(120,120,128,0.12)',
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: primary ? t.accentInk : c,
          fontWeight: '600',
          fontSize: small ? T.caption : T.body,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: t.bg }}>
      <ActivityIndicator color={t.text2} />
      <Text style={{ color: t.text2, marginTop: S.sm + 2, fontSize: T.body2 }}>{text}</Text>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <Card tint={t.bad}>
      <Text style={{ color: t.bad, fontSize: T.body, fontWeight: '600', marginBottom: 4 }}>出错了</Text>
      <Text style={{ color: t.text2, fontSize: T.body2, lineHeight: 21, marginBottom: S.md }}>{message}</Text>
      {onRetry ? <Btn title="重试" onPress={onRetry} small /> : null}
    </Card>
  );
}

export function Empty({ text }: { text: string }) {
  const t = useTheme();
  return (
    <Card>
      <Text style={{ color: t.text2, fontSize: T.body2, textAlign: 'center', paddingVertical: S.lg }}>
        {text}
      </Text>
    </Card>
  );
}

/**
 * 可展开的说明文字。
 *
 * 图表下面那些「横轴是什么、线在哪儿算危险」的长解释，平时没人看，
 * 但它又确实有用 —— 所以默认只留一行小字，点开才展开。
 * 用箭头旋转 + 内容直接出现（不做高度动画，避免测量不准导致跳动）。
 */
export function Hint({
  label = '这张图怎么看',
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const s = useStyles();
  const [open, setOpen] = React.useState(false);
  const anim = React.useRef(new Animated.Value(0)).current;

  const toggle = React.useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      Animated.timing(anim, {
        toValue: next ? 1 : 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      return next;
    });
  }, [anim]);

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <View style={s.hint}>
      {open ? <Text style={s.hintBody}>{children}</Text> : null}
      <Pressable onPress={toggle} hitSlop={10} style={s.hintHead}>
        <Text style={s.hintLabel}>{open ? '收起' : label}</Text>
        <Animated.Text style={[s.hintChev, { transform: [{ rotate }] }]}>›</Animated.Text>
      </Pressable>
    </View>
  );
}

/**
 * 进度条。
 *
 * 大模型没法给出真实百分比（谁也不知道还要写多久），这里用的是
 * 「估算进度」：按预计耗时长到 92%，真正完成时再补到 100%。
 * 关键是永远不要停在 99% —— 那比没有进度条更让人焦虑。
 */
export function Progress({
  value,
  height = 4,
}: {
  value: Animated.Value;
  height?: number;
}) {
  const t = useTheme();
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: t.cardInner, overflow: 'hidden' }}>
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: t.accent,
          width: value.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

/** 细分割线 */
export function Divider({ inset = 0 }: { inset?: number }) {  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: inset }} />;
}

/**
 * 表单输入行。用于填写 API Key、账号密码这类配置。
 *
 * 刻意不做浮动标签、不做边框：iOS 设置里的输入框就是一行白底 + 上面一行灰字。
 * 密码类字段永远不回显原值 —— 上层传进来的 value 是「新输入的内容」，
 * 服务器已有的值只以「已保存 ·••••1234」的形式展示在 hint 里。
 */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  hint,
  mono,
  autoFocus,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  hint?: string;
  mono?: boolean;
  autoFocus?: boolean;
  keyboardType?: 'default' | 'email-address' | 'url';
}) {
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={{ marginBottom: S.md }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[s.fieldBox, { backgroundColor: t.card, borderColor: t.border }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.text3}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          keyboardType={keyboardType}
          style={[
            s.fieldInput,
            { color: t.text },
            mono ? { fontFamily: undefined, letterSpacing: 0.2 } : null,
          ]}
        />
      </View>
      {hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** 给需要自定义文字的地方复用 */
export const text = {
  body: (t: Theme): TextStyle => ({ color: t.text, fontSize: T.body }),
  secondary: (t: Theme): TextStyle => ({ color: t.text2, fontSize: T.body2, lineHeight: 21 }),
};

const useStyles = makeStyles((t: Theme) => ({
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.md,
    marginBottom: S.sm - 2,
  },
  sectionTitle: {
    color: t.text2,
    fontSize: T.caption,
    fontWeight: '400',
  },
  sectionDesc: {
    color: t.text2,
    fontSize: T.caption,
    lineHeight: 18,
    paddingHorizontal: S.md,
    marginTop: -2,
    marginBottom: S.sm,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: S.md - 4,
    gap: S.sm,
  },
  cardTitle: {
    color: t.text,
    fontSize: T.body,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  cardSub: { color: t.text2, fontSize: T.caption, marginTop: 2 },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    minHeight: 48,
    paddingVertical: 11,
  },
  listTitle: { color: t.text, fontSize: T.body, letterSpacing: -0.2 },
  listSub: { color: t.text2, fontSize: T.caption, marginTop: 2, lineHeight: 18 },
  listValue: { color: t.text2, fontSize: T.body, ...TNUM },
  chevron: { fontSize: 22, fontWeight: '300', marginLeft: 6, marginTop: -2 },

  fieldLabel: {
    color: t.text2,
    fontSize: T.caption,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  fieldBox: {
    borderRadius: R.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: S.md - 2,
  },
  fieldInput: {
    fontSize: T.body2,
    minHeight: 44,
    paddingVertical: 10,
  },
  fieldHint: {
    color: t.text3,
    fontSize: T.micro,
    lineHeight: 17,
    marginTop: 5,
    paddingHorizontal: 2,
  },

  stat: { flex: 1, minWidth: 70, paddingVertical: 2 },
  statLabel: {
    color: t.text2,
    fontSize: T.caption,
    marginBottom: 2,
  },
  statValue: {
    color: t.text,
    fontSize: T.num,
    fontWeight: '600',
    letterSpacing: -0.8,
    ...TNUM,
  },
  statBig: {
    color: t.text,
    fontSize: T.hero,
    fontWeight: '600',
    letterSpacing: -2,
    ...TNUM,
  },
  statUnit: { color: t.text2, fontSize: T.caption, fontWeight: '400', letterSpacing: 0 },

  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { color: t.text2, fontSize: T.body },
  rowDots: { flex: 1 },
  rowValue: { color: t.text, fontSize: T.body, fontWeight: '500', ...TNUM },

  hint: { marginTop: S.md },
  hintHead: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  hintLabel: { color: t.accent, fontSize: T.caption, fontWeight: '500' },
  hintChev: { color: t.accent, fontSize: T.caption + 3, fontWeight: '500', marginTop: -1 },
  hintBody: { color: t.text2, fontSize: T.caption + 1, lineHeight: 21, marginBottom: S.sm },

  btn: {
    paddingVertical: 12,
    paddingHorizontal: S.lg,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: R.sm },
}));
