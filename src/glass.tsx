/**
 * 液态玻璃（Liquid Glass）
 *
 * iOS 26 起苹果在系统里内置了 Liquid Glass 材质，对应的原生组件是 UIGlassEffect，
 * Expo 把它封装成了 `expo-glass-effect` 的 <GlassView />（react-native-screens 的原生
 * 标签栏 NativeTabs 也会自动用上）。
 *
 * 注意两点：
 *  1. 只在 iOS 26+ 有效，低版本系统 isLiquidGlassAvailable() 返回 false；
 *  2. 它是原生模块，必须打包含该模块的客户端（Expo Go / dev build）。
 *
 * 所以这里做一层封装：能用就用系统材质，不能就退回到「半透明 + 细边框」的普通视图，
 * 保证任何设备上都不会白屏或报错。
 */
import React from 'react';
import { View, StyleSheet, Platform, type ViewStyle } from 'react-native';
import { useTheme } from './theme-provider';

type GlassProps = {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** 轻微染色，让玻璃偏一点主题色 */
  tint?: string;
  /** interactive 的玻璃会对触摸有反应（按钮用） */
  interactive?: boolean;
  /** regular = 常规玻璃；clear = 更透 */
  variant?: 'regular' | 'clear';
};

let NativeGlassView: any = null;
let nativeAvailable = false;

try {
  // 用 require 而不是 import：模块缺失时不会让整个包崩掉
  const mod = require('expo-glass-effect');
  NativeGlassView = mod.GlassView;
  nativeAvailable = Platform.OS === 'ios' && !!mod.isLiquidGlassAvailable?.();
} catch {
  nativeAvailable = false;
}

/** 当前设备能不能用苹果原生的液态玻璃 */
export const isGlassSupported = nativeAvailable;

export function Glass({ children, style, tint, interactive, variant = 'regular' }: GlassProps) {
  const t = useTheme();
  if (nativeAvailable && NativeGlassView) {
    return (
      <NativeGlassView
        glassEffectStyle={variant}
        tintColor={tint}
        isInteractive={!!interactive}
        style={style}
      >
        {children}
      </NativeGlassView>
    );
  }
  // —— 兜底：视觉上尽量接近，但不是系统材质 ——
  return (
    <View
      style={[
        {
          backgroundColor: t.dark ? 'rgba(26,30,38,0.86)' : 'rgba(255,255,255,0.9)',
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: t.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.12 }]} /> : null}
      {children}
    </View>
  );
}

/** 给不支持的设备用：加一圈高光描边，模拟玻璃边缘 */
export function glassBorder(color = 'rgba(255,255,255,0.14)') {
  return {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: color,
    borderTopColor: 'rgba(255,255,255,0.22)',
  } as ViewStyle;
}
