import pino, { type Logger } from 'pino';
import { SessionEventBus, type SessionEvent } from './event-bus.js';
import { normalizeWhatsAppJid } from './jid.js';
import { SessionManager } from './session-manager.js';
import type { DisconnectOptions, SessionPublicState, WhatsAppClientOptions } from './types.js';

/**
 * Fachada pública: sessões Baileys + event bus in-process.
 */
export class WhatsAppClient {
  private readonly eventBus: SessionEventBus;
  private readonly sessions: SessionManager;

  constructor(options: WhatsAppClientOptions) {
    const logger: Logger = options.logger ?? pino({ level: options.logLevel ?? 'info' });
    this.eventBus = new SessionEventBus();
    this.sessions = new SessionManager({
      authProvider: options.authProvider,
      eventBus: this.eventBus,
      onMessage: options.onMessage,
      onMedia: options.onMedia,
      maxSessions: options.maxSessions ?? 50,
      logger,
    });
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
