import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { STACK_OPTIONS } from '../src/nav';
import { TokenGate } from '../src/authGate';
import { syncReminders } from '../src/notify';

export default function RootLayout() {
  // 每次启动重排未来 7 天的训练提醒（课表可能变了）
  React.useEffect(() => {
    const t = setTimeout(() => {
      syncReminders().catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <TokenGate>
        <Stack screenOptions={STACK_OPTIONS}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="activity/[id]" options={{ title: '活动详情' }} />
          <Stack.Screen name="activities" options={{ title: '全部活动' }} />
        </Stack>
      </TokenGate>
    </SafeAreaProvider>
  );
}
