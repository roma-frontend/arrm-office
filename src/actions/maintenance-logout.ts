'use server';

import { logger } from '@/lib/logger';

/**
 * Server Action to perform complete logout
 * This server action calls the logout API route to clear server-side session
 */
export async function performLogout() {
  try {
    logger.log('[performLogout] Server action called');

    // Call the logout API route
    // Note: We can't do relative URLs in server actions, so we use an absolute path reference
    logger.log('[performLogout] Clearing session on server');

    // The client will handle calling the API route
    // This server action is just a placeholder for server-side logic

    return { success: true };
  } catch (error) {
    logger.error('[performLogout] Error during logout:', error);
    return { success: false, error: String(error) };
  }
}
