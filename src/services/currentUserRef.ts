import type { User } from '../types';

/**
 * Shared module-level ref to the currently authenticated user.
 * Kept in a zero-dependency leaf module so services and AppContext
 * can read/update it without circular imports or Rollup TDZ issues.
 */
export const currentUserRef = { current: null as User | null };
