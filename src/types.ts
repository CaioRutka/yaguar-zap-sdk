import type { WASocket } from '@whiskeysockets/baileys';
import type { Logger } from 'pino';
import type { OutgoingLimits } from './outgoing/limits.js';
import type { AuthStateProvider } from './providers/auth-state.provider.js';
import type { MediaHandler } from './providers/media-handler.provider.js';
import type { MessageHandler } from './providers/message-handler.provider.js';

/** Hook após criar o socket (credenciais já ligadas). Para ingestão custom (ex.: CRM com `WAMessage` bruto). */
export type OnSocketReadyArgs = {
  socket: WASocket;
  sessionId: string;
  logger: Logger;
};

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
  /**
   * Se true, não registra o pipeline interno de `messages.upsert`.
   * Use com `onSocketReady` para anexar listeners próprios (ex.: persistência CRM).
   */
  skipBuiltinMessagePipeline?: boolean;
  /** Chamado após `makeWASocket` + `creds.update`, antes de `connection.update` completar. */
  onSocketReady?: (args: OnSocketReadyArgs) => void | Promise<void>;
  /** Limite de sockets simultâneos (default 50). */
  maxSessions?: number;
  /** Nível do logger Pino (default `info`). */
  logLevel?: string;
  /** Logger customizado (ex.: child do Pino da app). */
  logger?: Logger;
  /**
   * Limites para `sendOutgoing` / `trySendOutgoing` / `validateOutgoingMessage`
   * quando usados via este client (merge com defaults).
   */
  outgoingLimits?: Partial<OutgoingLimits>;
};
