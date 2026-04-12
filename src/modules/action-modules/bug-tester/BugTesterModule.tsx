import React from 'react';
import BugHunter from '../../../components/BugHunter';
import type { ActionModuleProps } from '../types';

/**
 * Bug Tester — floating bug report widget (session-authenticated POST to /api/sovereign/bugs).
 */
export function BugTesterModule(_props: ActionModuleProps): React.ReactElement {
  return <BugHunter />;
}
