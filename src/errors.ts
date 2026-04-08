import type { ConnectionStatus } from './types.js';

/** Base para erros do SDK (sem status HTTP). */
export class WhatsAppSDKError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'WhatsAppSDKError';
  }
}

export class SessionNotConnectedError extends WhatsAppSDKError {
  constructor(connection: ConnectionStatus | 'none') {
    super('Sessão WhatsApp não está conectada', 'WA_NOT_CONNECTED', { connection });
    this.name = 'SessionNotConnectedError';
  }
}

export class SessionLimitError extends WhatsAppSDKError {
  constructor(max: number) {
    super(`Limite de sessões atingido (${max})`, 'MAX_SESSIONS', { max });
    this.name = 'SessionLimitError';
  }
}

export class InvalidJidError extends WhatsAppSDKError {
  constructor(message: string, details?: unknown) {
    super(message, 'INVALID_JID', details);
    this.name = 'InvalidJidError';
  }
}

export class SendIncompleteError extends WhatsAppSDKError {
  constructor() {
    super('Envio não retornou identificador da mensagem', 'WA_SEND_INCOMPLETE');
    this.name = 'SendIncompleteError';
  }
}

export function isWhatsAppSDKError(err: unknown): err is WhatsAppSDKError {
  return err instanceof WhatsAppSDKError;
}
