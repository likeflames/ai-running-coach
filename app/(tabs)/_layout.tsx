import React from 'react';
import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '../../src/theme-provider';
import { T } from '../../src/theme';

/**
 * 用的是 iOS 系统自带的 UITabBarController（expo-router/native-tabs）。
 * iOS 26 上系统自动画液态玻璃、自动随滚动收缩，不需要写任何样式。
 *
 * build 15 起只有 3 个主标签：
 *   今日 = 当天状态 / 恢复 / 建议
 *   计划 = 训练课表 + 比赛策略（页内分段切换）
 *   对话 = 教练问答
 * 原「健康」的所有趋势图表集中到 `/data`（从今日右上角进入），
 * 原「比赛」的负荷预测折线也一并移过去，避免同一张图出现在多处。
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

      <NativeTabs.Trigger name="plan">
        <NativeTabs.Trigger.Icon sf={{ default: 'figure.run', selected: 'figure.run' }} />
        <NativeTabs.Trigger.Label>计划</NativeTabs.Trigger.Label>
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
