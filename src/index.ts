/**
 * @yaguar/whatsapp-sdk — comunicação WhatsApp Web (Baileys) sem servidor HTTP ou ORM.
 */

export { WhatsAppClient } from './client.js';
export { SessionEventBus, type SessionEvent } from './event-bus.js';
export {
  InvalidJidError,
  SendIncompleteError,
  SessionLimitError,
  SessionNotConnectedError,
  WhatsAppSDKError,
  isWhatsAppSDKError,
} from './errors.js';
export { normalizeWhatsAppJid } from './jid.js';
export { MemoryAuthStateProvider } from './providers/memory-auth-state.js';
export type { AuthStateProvider } from './providers/auth-state.provider.js';
export type { MediaDownload, MediaHandler } from './providers/media-handler.provider.js';
export type { IncomingMessage, MessageHandler } from './providers/message-handler.provider.js';
export { SessionManager, type SessionManagerDeps } from './session-manager.js';
export type {
  ConnectionStatus,
  DisconnectOptions,
  SessionPublicState,
  WhatsAppClientOptions,
} from './types.js';
