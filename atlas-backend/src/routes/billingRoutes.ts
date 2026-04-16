/**
 * billingRoutes.ts — Live billing routes.
 * Re-exports the v4 groundwork implementation from its canonical location.
 *
 * All billing route logic lives in the groundwork v4 module; this re-export
 * provides a stable import path for index.ts:
 *   import { registerBillingRoutes } from './routes/billingRoutes.js';
 */
export {
  registerBillingRoutes,
  billingPlugin,
} from '../services/intelligence/groundwork/v4/billingRoutes.js';
