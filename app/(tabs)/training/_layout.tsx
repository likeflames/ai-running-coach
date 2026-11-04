import React from 'react';
import { Stack } from 'expo-router';
import { largeTitleOptions } from '../../../src/nav';
import { useTheme } from '../../../src/theme-provider';

export default function TrainingLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={largeTitleOptions(t)}>
      <Stack.Screen name="index" options={{ title: '训练' }} />
    </Stack>
  );
}
