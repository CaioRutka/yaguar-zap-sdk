/**
 * @yaguar/whatsapp-sdk — comunicação WhatsApp Web (Baileys) sem servidor HTTP ou ORM.
 */

export { WhatsAppClient } from './client.js';
export { SessionEventBus, type SessionEvent } from './event-bus.js';
export {
  InvalidJidError,
  OutgoingValidationError,
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
  OnSocketReadyArgs,
  SessionPublicState,
  WhatsAppClientOptions,
} from './types.js';
export {
  DEFAULT_OUTGOING_LIMITS,
  mergeOutgoingLimits,
  validateOutgoingMessage,
} from './outgoing/index.js';
export type {
  OutgoingAudioPayload,
  OutgoingDocumentPayload,
  OutgoingImagePayload,
  OutgoingIssue,
  OutgoingLimits,
  OutgoingMessagePayload,
  OutgoingTextPayload,
  OutgoingVideoPayload,
  TrySendOutgoingFailure,
  TrySendOutgoingResult,
  TrySendOutgoingSuccess,
  ValidateOutgoingResult,
} from './outgoing/index.js';
