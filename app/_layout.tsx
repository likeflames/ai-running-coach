import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { stackOptions } from '../src/nav';
import { TokenGate } from '../src/authGate';
import { syncReminders } from '../src/notify';
import { ThemeProvider, useTheme } from '../src/theme-provider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppShell() {
  const t = useTheme();

  // 每次启动重排未来 7 天的训练提醒（课表可能变了）
  React.useEffect(() => {
    const timer = setTimeout(() => {
      syncReminders().catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <TokenGate>
        <Stack screenOptions={stackOptions(t)}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="activity/[id]" options={{ title: '活动详情' }} />
          <Stack.Screen name="activities" options={{ title: '全部活动' }} />
        </Stack>
      </TokenGate>
    </>
  );
}
