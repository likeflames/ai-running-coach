/* 导航栏统一配置：交给 iOS 系统绘制（iOS 26 上是原生的液态玻璃导航栏） */
import { C } from './theme';

export const STACK_OPTIONS = {
  // 不设 headerStyle：让系统自己画背景，iOS 26 才会出玻璃效果
  headerTintColor: C.text,
  headerTitleStyle: { fontSize: 16, fontWeight: '600' as const },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal' as const,
  contentStyle: { backgroundColor: C.bg },
};
