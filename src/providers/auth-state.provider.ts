import type { AuthenticationState } from '@whiskeysockets/baileys';

/**
 * Persistência do auth state do Baileys (equivalente a `useMultiFileAuthState`).
 * Implemente com Mongo, Redis, disco, etc.
 */
export interface AuthStateProvider {
  loadState(sessionId: string): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }>;
  clearState(sessionId: string): Promise<void>;
}
