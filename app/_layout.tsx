import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { STACK_OPTIONS } from '../src/nav';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={STACK_OPTIONS}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="activity/[id]" options={{ title: '活动详情' }} />
        <Stack.Screen name="activities" options={{ title: '全部活动' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
