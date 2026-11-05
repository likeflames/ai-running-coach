import React from 'react';
import { Screen } from '../src/ui';
import DataView from '../src/views/DataView';

/** 全 App 唯一的趋势图页面，从「今日」右上角进入。 */
export default function DataScreen() {
  return (
    <Screen>
      <DataView />
    </Screen>
  );
}
