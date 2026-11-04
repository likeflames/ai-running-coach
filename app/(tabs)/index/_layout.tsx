import React from 'react';
import { Stack } from 'expo-router';
import { STACK_OPTIONS } from '../../../src/nav';

export default function TodayLayout() {
  return (
    <Stack screenOptions={STACK_OPTIONS}>
      <Stack.Screen name="index" options={{ title: '今日' }} />
    </Stack>
  );
}
