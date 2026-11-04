import React from 'react';
import { Stack } from 'expo-router';
import { STACK_OPTIONS } from '../../../src/nav';

export default function HealthLayout() {
  return (
    <Stack screenOptions={STACK_OPTIONS}>
      <Stack.Screen name="index" options={{ title: '健康' }} />
    </Stack>
  );
}
