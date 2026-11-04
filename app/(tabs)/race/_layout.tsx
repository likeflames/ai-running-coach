import React from 'react';
import { Stack } from 'expo-router';
import { STACK_OPTIONS } from '../../../src/nav';

export default function RaceLayout() {
  return (
    <Stack screenOptions={STACK_OPTIONS}>
      <Stack.Screen name="index" options={{ title: '比赛' }} />
    </Stack>
  );
}
