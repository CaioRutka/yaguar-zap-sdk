import pino, { type Logger } from 'pino';
import { SessionEventBus, type SessionEvent } from './event-bus.js';
import { OutgoingValidationError, isWhatsAppSDKError } from './errors.js';
import { normalizeWhatsAppJid } from './jid.js';
import { mergeOutgoingLimits, validateOutgoingMessage } from './outgoing/index.js';
import type { OutgoingMessagePayload, TrySendOutgoingResult } from './outgoing/types.js';
import type { OutgoingLimits } from './outgoing/limits.js';
import { SessionManager } from './session-manager.js';
import type { DisconnectOptions, SessionPublicState, WhatsAppClientOptions } from './types.js';

/**
 * Fachada pública: sessões Baileys + event bus in-process.
 */
export class WhatsAppClient {
  private readonly eventBus: SessionEventBus;
  private readonly sessions: SessionManager;
  private readonly outgoingLimitsPartial: Partial<OutgoingLimits> | undefined;

  constructor(options: WhatsAppClientOptions) {
    const logger: Logger = options.logger ?? pino({ level: options.logLevel ?? 'info' });
    this.outgoingLimitsPartial = options.outgoingLimits;
    this.eventBus = new SessionEventBus();
    this.sessions = new SessionManager({
      authProvider: options.authProvider,
      eventBus: this.eventBus,
      onMessage: options.onMessage,
      onMedia: options.onMedia,
      skipBuiltinMessagePipeline: options.skipBuiltinMessagePipeline,
      onSocketReady: options.onSocketReady,
      maxSessions: options.maxSessions ?? 50,
      logger,
    });
  }

  private resolvedOutgoingLimits(): OutgoingLimits {
    return mergeOutgoingLimits(this.outgoingLimitsPartial);
  }

  /**
   * Envia mensagem a partir de um payload discriminado (`kind`).
   * Valida com os limites do client (`outgoingLimits` nas opções) e lança `OutgoingValidationError` se inválido.
   */
  async sendOutgoing(sessionId: string, payload: unknown): Promise<{ waMessageId: string }> {
    const limits = this.resolvedOutgoingLimits();
    const validated = validateOutgoingMessage(payload, limits);
    if (!validated.ok) {
      throw new OutgoingValidationError(validated.issues);
    }
    const remoteJid = normalizeWhatsAppJid(validated.value.to);
    return this.dispatchOutgoingPayload(sessionId, validated.value, remoteJid);
  }

  /**
   * Como `sendOutgoing`, mas não lança em validação nem em erros conhecidos do SDK (`WhatsAppSDKError`).
   * Outros erros são retornados em `error`.
   */
  async trySendOutgoing(sessionId: string, payload: unknown): Promise<TrySendOutgoingResult> {
    const limits = this.resolvedOutgoingLimits();
    const validated = validateOutgoingMessage(payload, limits);
    if (!validated.ok) {
      return { ok: false, issues: validated.issues };
    }
    try {
      const remoteJid = normalizeWhatsAppJid(validated.value.to);
      const { waMessageId } = await this.dispatchOutgoingPayload(
        sessionId,
        validated.value,
        remoteJid,
      );
      return { ok: true, waMessageId };
    } catch (err) {
      if (isWhatsAppSDKError(err)) {
        return { ok: false, error: err };
      }
      if (err instanceof Error) {
        return { ok: false, error: err };
      }
      return { ok: false, error: new Error(String(err)) };
    }
  }

  private async dispatchOutgoingPayload(
    sessionId: string,
    value: OutgoingMessagePayload,
    remoteJid: string,
  ): Promise<{ waMessageId: string }> {
    switch (value.kind) {
      case 'text':
        if (value.typingSimulation) {
          return this.sessions.sendTextWithTypingSimulation(sessionId, remoteJid, value.body);
        }
        return this.sessions.sendText(sessionId, remoteJid, value.body);
      case 'image':
        return this.sessions.sendImage(
          sessionId,
          remoteJid,
          value.data,
          value.caption,
          value.mimetype,
        );
      case 'audio':
        return this.sessions.sendAudio(sessionId, remoteJid, value.data, value.voiceNote ?? false);
      case 'video':
        return this.sessions.sendVideo(sessionId, remoteJid, value.data, value.caption);
      case 'document':
        return this.sessions.sendDocument(
          sessionId,
          remoteJid,
          value.data,
          value.filename,
          value.mimetype,
        );
      default: {
        const _exhaustive: never = value;
        return _exhaustive;
      }
    }
  }

  connect(sessionId: string): Promise<SessionPublicState> {
    return this.sessions.startSession(sessionId);
  }

  on(sessionId: string, handler: (event: SessionEvent) => void): () => void {
    return this.eventBus.onSession(sessionId, handler);
  }

  getState(sessionId: string): SessionPublicState | null {
    return this.sessions.getState(sessionId);
  }

  listStates(): SessionPublicState[] {
    return this.sessions.listStates();
  }

  async sendText(sessionId: string, remoteJidRaw: string, text: string): Promise<{ waMessageId: string }> {
    const remoteJid = normalizeWhatsAppJid(remoteJidRaw);
    return this.sessions.sendText(sessionId, remoteJid, text);
  }

  async sendTextWithTyping(
    sessionId: string,
    remoteJidRaw: string,
    text: string,
  ): Promise<{ waMessageId: string }> {
    const remoteJid = normalizeWhatsAppJid(remoteJidRaw);
    return this.sessions.sendTextWithTypingSimulation(sessionId, remoteJid, text);
  }

  async sendImage(
    sessionId: string,
    remoteJidRaw: string,
    imageBuffer: Buffer,
    caption?: string,
    mimetype?: string,
  ): Promise<{ waMessageId: string }> {
    const remoteJid = normalizeWhatsAppJid(remoteJidRaw);
    return this.sessions.sendImage(sessionId, remoteJid, imageBuffer, caption, mimetype);
  }

  async sendAudio(
    sessionId: string,
    remoteJidRaw: string,
    audioBuffer: Buffer,
    ptt = false,
  ): Promise<{ waMessageId: string }> {
    const remoteJid = normalizeWhatsAppJid(remoteJidRaw);
    return this.sessions.sendAudio(sessionId, remoteJid, audioBuffer, ptt);
  }

  async sendVideo(
    sessionId: string,
    remoteJidRaw: string,
    videoBuffer: Buffer,
    caption?: string,
  ): Promise<{ waMessageId: string }> {
    const remoteJid = normalizeWhatsAppJid(remoteJidRaw);
    return this.sessions.sendVideo(sessionId, remoteJid, videoBuffer, caption);
  }

  async sendDocument(
    sessionId: string,
    remoteJidRaw: string,
    docBuffer: Buffer,
    filename: string,
    mimetype: string,
  ): Promise<{ waMessageId: string }> {
    const remoteJid = normalizeWhatsAppJid(remoteJidRaw);
    return this.sessions.sendDocument(sessionId, remoteJid, docBuffer, filename, mimetype);
  }

  async disconnect(sessionId: string, opts?: DisconnectOptions): Promise<void> {
    await this.sessions.stopSession(sessionId, {
      logoutRemote: opts?.logout,
      clearAuth: opts?.clearAuth,
    });
  }

  shutdownAll(): void {
    this.sessions.shutdownAllSockets();
  }

  /** Para integrar com SSE/WebSocket no host. */
  getEventBus(): SessionEventBus {
    return this.eventBus;
  }

  /** Uso avançado (ex.: testes). */
  getSessionManager(): SessionManager {
    return this.sessions;
  }
}
