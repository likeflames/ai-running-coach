/* 导航栏统一配置：交给 iOS 系统绘制（iOS 26 上是原生的液态玻璃导航栏） */
import type { Theme } from './theme';

/**
 * 普通页面（详情页等）：小标题栏。
 * 不设 headerStyle：让系统自己画背景，iOS 26 才会出玻璃效果。
 */
export function stackOptions(t: Theme) {
  return {
    headerTintColor: t.accent,
    headerTitleStyle: { fontSize: 17, fontWeight: '600' as const, color: t.text },
    headerLargeTitleStyle: { color: t.text },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: t.bg },
  };
}

/**
 * 内容会滚到标题栏底下的页面（对话这种）：用小标题 + 不透明背景。
 *
 * 大标题是给「列表页」用的 —— 聊天记录会一路往上滚，34pt 的大标题
 * 一路被内容压住，滚动收缩时内容还会从标题后面透出来，很难看。
 */
export function solidHeaderOptions(t: Theme) {
  return {
    ...stackOptions(t),
    headerStyle: { backgroundColor: t.bg },
  };
}

/**
 * 主页面：iOS 大标题（34pt），内容上滑时自动缩成 17pt 的小标题。
 * 这是苹果自带 App 最标志性的动作，比任何自绘标题都"原生"。
 */
export function largeTitleOptions(t: Theme) {
  return {
    ...stackOptions(t),
    headerLargeTitle: true,
    headerLargeTitleShadowVisible: false,
    headerLargeTitleStyle: { color: t.text, fontWeight: '700' as const },
  };
}
