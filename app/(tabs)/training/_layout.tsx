import React from 'react';
import { Stack } from 'expo-router';
import { STACK_OPTIONS } from '../../../src/nav';

export default function TrainingLayout() {
  return (
    <Stack screenOptions={STACK_OPTIONS}>
      <Stack.Screen name="index" options={{ title: '训练' }} />
    </Stack>
  );
}
