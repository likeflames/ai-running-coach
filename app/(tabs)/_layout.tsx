import React from 'react';
import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '../../src/theme-provider';
import { T } from '../../src/theme';

/**
 * 用的是 iOS 系统自带的 UITabBarController（expo-router/native-tabs）。
 * iOS 26 上系统自动画液态玻璃、自动随滚动收缩，不需要写任何样式。
 */
export default function TabsLayout() {
  const t = useTheme();
  return (
    <NativeTabs
      iconColor={{ default: t.text3, selected: t.accent }}
      tintColor={t.accent}
      labelStyle={{
        default: { color: t.text3, fontSize: T.micro },
        selected: { color: t.accent, fontSize: T.micro },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>今日</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="training">
        <NativeTabs.Trigger.Icon sf="figure.run" />
        <NativeTabs.Trigger.Label>训练</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="health">
        <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} />
        <NativeTabs.Trigger.Label>健康</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="race">
        <NativeTabs.Trigger.Icon sf={{ default: 'flag', selected: 'flag.fill' }} />
        <NativeTabs.Trigger.Label>比赛</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="chat">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }}
        />
        <NativeTabs.Trigger.Label>对话</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
