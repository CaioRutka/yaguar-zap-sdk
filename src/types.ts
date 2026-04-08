import type { Logger } from 'pino';
import type { AuthStateProvider } from './providers/auth-state.provider.js';
import type { MediaHandler } from './providers/media-handler.provider.js';
import type { MessageHandler } from './providers/message-handler.provider.js';

export type ConnectionStatus = 'connecting' | 'open' | 'close';

/**
 * Estado público de uma sessão (para UI / health checks).
 */
export type SessionPublicState = {
  sessionId: string;
  connection: ConnectionStatus;
  qr: string | null;
  loggedInUser: { id: string; name?: string } | null;
  lastDisconnectReason?: number;
  lastErrorMessage?: string;
};

export type DisconnectOptions = {
  /** Chama `sock.logout()` no WhatsApp (desvincula o número). */
  logout?: boolean;
  /** Remove credenciais persistidas via `AuthStateProvider.clearState`. */
  clearAuth?: boolean;
};

export type WhatsAppClientOptions = {
  authProvider: AuthStateProvider;
  /** Chamado para cada mensagem recebida (após mapeamento básico). */
  onMessage?: MessageHandler;
  /** Opcional: se definido, o SDK baixa mídia e repassa o buffer. */
  onMedia?: MediaHandler;
  /** Limite de sockets simultâneos (default 50). */
  maxSessions?: number;
  /** Nível do logger Pino (default `info`). */
  logLevel?: string;
  /** Logger customizado (ex.: child do Pino da app). */
  logger?: Logger;
};
