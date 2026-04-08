import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  getContentType,
  type proto,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import type { Logger } from 'pino';
import type { SessionEventBus } from './event-bus.js';
import {
  SendIncompleteError,
  SessionLimitError,
  SessionNotConnectedError,
} from './errors.js';
import type { AuthStateProvider } from './providers/auth-state.provider.js';
import type { MediaHandler } from './providers/media-handler.provider.js';
import type { IncomingMessage, MessageHandler } from './providers/message-handler.provider.js';
import type { ConnectionStatus, SessionPublicState } from './types.js';

const MEDIA_CONTENT_TYPES = new Set([
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'stickerMessage',
]);

type ProtoMessage = Parameters<typeof getContentType>[0];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function broadcastTypingDurationMs(text: string): number {
  const len = Math.max(1, text.trim().length);
  const base = 800;
  const perChar = 30;
  const jitter = 0.88 + Math.random() * 0.24;
  const raw = (base + len * perChar) * jitter;
  return Math.min(9000, Math.max(1000, Math.round(raw)));
}

function waTimestampToDate(ts: unknown): Date {
  const n = typeof ts === 'number' ? ts : Number(ts ?? 0);
  if (!Number.isFinite(n) || n <= 0) return new Date();
  const seconds = n > 1_000_000_000_000 ? Math.floor(n / 1000) : n;
  return new Date(seconds * 1000);
}

function extractPreviewText(message: proto.IMessage | null | undefined): string | undefined {
  if (!message) return undefined;
  if (message.conversation) return message.conversation;
  const ext = message.extendedTextMessage?.text;
  if (ext) return ext;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  return undefined;
}

function extractDocumentFileName(message: proto.IMessage | null | undefined): string | undefined {
  return message?.documentMessage?.fileName ?? undefined;
}

function extractMediaMimetype(message: proto.IMessage | null | undefined): string | undefined {
  if (!message) return undefined;
  const raw =
    message.imageMessage?.mimetype ||
    message.videoMessage?.mimetype ||
    message.audioMessage?.mimetype ||
    message.documentMessage?.mimetype ||
    message.stickerMessage?.mimetype;
  return raw ?? undefined;
}

function shouldPersistMediaDownload(m: { message?: ProtoMessage }): boolean {
  const ct = getContentType(m.message);
  return Boolean(ct && MEDIA_CONTENT_TYPES.has(String(ct)));
}

function disconnectMeta(err: unknown): { statusCode?: number; message?: string } {
  if (err && typeof err === 'object' && 'output' in err) {
    const output = (err as { output?: { statusCode?: number } }).output;
    const message = err instanceof Error ? err.message : undefined;
    return { statusCode: output?.statusCode, message };
  }
  if (err instanceof Error) return { message: err.message };
  return {};
}

function mapToIncoming(
  sessionId: string,
  msg: WAMessage,
  upsertType: string,
): IncomingMessage | null {
  const id = msg.key?.id;
  const remoteJid = msg.key?.remoteJid;
  if (!id || !remoteJid) {
    return null;
  }
  const contentType = getContentType(msg.message ?? undefined);
  const text = extractPreviewText(msg.message ?? undefined);
  const mediaMimetype = extractMediaMimetype(msg.message ?? undefined);
  const documentFileName = extractDocumentFileName(msg.message ?? undefined);
  const ctStr = contentType ? String(contentType) : undefined;
  const hasMedia = Boolean(ctStr && MEDIA_CONTENT_TYPES.has(ctStr));

  const jidAlt =
    typeof (msg.key as { remoteJidAlt?: string } | undefined)?.remoteJidAlt === 'string'
      ? (msg.key as { remoteJidAlt: string }).remoteJidAlt
      : undefined;

  return {
    sessionId,
    waMessageId: id,
    remoteJid,
    remoteJidAlt: jidAlt,
    fromMe: Boolean(msg.key.fromMe),
    pushName: msg.pushName ?? undefined,
    timestamp: waTimestampToDate(msg.messageTimestamp),
    contentType: ctStr,
    text,
    hasMedia,
    mediaMimetype,
    documentFileName,
    upsertType,
  };
}

function attachMessagePipeline(
  sock: WASocket,
  sessionId: string,
  log: Logger,
  eventBus: SessionEventBus,
  onMessage?: MessageHandler,
  onMedia?: MediaHandler,
): void {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const m of messages) {
      try {
        const incoming = mapToIncoming(sessionId, m, type);
        if (!incoming) continue;

        if (onMessage) {
          await onMessage(incoming);
        }

        if (shouldPersistMediaDownload({ message: m.message ?? undefined }) && onMedia && m.message) {
          try {
            const buffer = await downloadMediaMessage(
              m,
              'buffer',
              {},
              {
                logger: log as unknown as import('pino').Logger,
                reuploadRequest: sock.updateMediaMessage,
              },
            );
            const id = m.key?.id;
            const remoteJid = m.key?.remoteJid;
            if (id && remoteJid && Buffer.isBuffer(buffer)) {
              const mime =
                extractMediaMimetype(m.message ?? undefined) ?? 'application/octet-stream';
              const docName = extractDocumentFileName(m.message ?? undefined);
              await onMedia({
                sessionId,
                waMessageId: id,
                remoteJid,
                buffer,
                mimetype: mime,
                fileName: docName,
              });
            }
          } catch (mediaErr) {
            log.warn({ err: mediaErr, waMessageId: m.key?.id }, 'falha ao baixar mídia');
          }
        }

        eventBus.emitSession(sessionId, { type: 'message', message: incoming });
      } catch (err) {
        log.error({ err, waMessageId: m.key?.id }, 'falha ao processar mensagem');
      }
    }
  });
}

type InternalEntry = {
  sessionId: string;
  connection: ConnectionStatus;
  qr: string | null;
  socket: WASocket | undefined;
  saveCreds: (() => Promise<void>) | undefined;
  loggedInUser: { id: string; name?: string } | null;
  lastDisconnectReason?: number;
  lastErrorMessage?: string;
  stopRequested: boolean;
};

export type SessionManagerDeps = {
  authProvider: AuthStateProvider;
  eventBus: SessionEventBus;
  onMessage?: MessageHandler;
  onMedia?: MediaHandler;
  skipBuiltinMessagePipeline?: boolean;
  onSocketReady?: (args: {
    socket: WASocket;
    sessionId: string;
    logger: Logger;
  }) => void | Promise<void>;
  maxSessions: number;
  logger: Logger;
};

/**
 * Gerencia sockets Baileys por `sessionId` (sem Express/Mongo).
 */
export class SessionManager {
  private readonly sessions = new Map<string, InternalEntry>();
  private readonly deps: SessionManagerDeps;

  constructor(deps: SessionManagerDeps) {
    this.deps = deps;
  }

  private ensureEntry(sessionId: string): InternalEntry {
    let e = this.sessions.get(sessionId);
    if (!e) {
      e = {
        sessionId,
        connection: 'close',
        qr: null,
        socket: undefined,
        saveCreds: undefined,
        loggedInUser: null,
        stopRequested: false,
      };
      this.sessions.set(sessionId, e);
    }
    return e;
  }

  getState(sessionId: string): SessionPublicState | null {
    const e = this.sessions.get(sessionId);
    if (!e) return null;
    return this.toPublic(e);
  }

  listStates(): SessionPublicState[] {
    return [...this.sessions.values()].map((e) => this.toPublic(e));
  }

  private toPublic(e: InternalEntry): SessionPublicState {
    return {
      sessionId: e.sessionId,
      connection: e.connection,
      qr: e.qr,
      loggedInUser: e.loggedInUser,
      lastDisconnectReason: e.lastDisconnectReason,
      lastErrorMessage: e.lastErrorMessage,
    };
  }

  private getConnectedSocket(sessionId: string): WASocket {
    const entry = this.sessions.get(sessionId);
    if (!entry?.socket || entry.connection !== 'open') {
      throw new SessionNotConnectedError(entry?.connection ?? 'none');
    }
    return entry.socket;
  }

  async sendText(sessionId: string, remoteJid: string, text: string): Promise<{ waMessageId: string }> {
    const entry = this.sessions.get(sessionId);
    if (!entry?.socket || entry.connection !== 'open') {
      throw new SessionNotConnectedError(entry?.connection ?? 'none');
    }
    const result = await entry.socket.sendMessage(remoteJid, { text });
    const id = result?.key?.id;
    if (!id) throw new SendIncompleteError();
    return { waMessageId: id };
  }

  async sendTextWithTypingSimulation(
    sessionId: string,
    remoteJid: string,
    text: string,
  ): Promise<{ waMessageId: string }> {
    const sock = this.getConnectedSocket(sessionId);
    const delayMs = broadcastTypingDurationMs(text);

    try {
      await sock.presenceSubscribe(remoteJid).catch(() => undefined);
      await sock.sendPresenceUpdate('composing', remoteJid);
      await sleep(delayMs);
    } catch {
      /* presença opcional */
    }

    let result: Awaited<ReturnType<WASocket['sendMessage']>> | undefined;
    try {
      result = await sock.sendMessage(remoteJid, { text });
    } finally {
      try {
        await sock.sendPresenceUpdate('paused', remoteJid);
      } catch {
        /* ignore */
      }
    }

    const id = result?.key?.id;
    if (!id) throw new SendIncompleteError();
    return { waMessageId: id };
  }

  async sendImage(
    sessionId: string,
    remoteJid: string,
    imageBuffer: Buffer,
    caption?: string,
    mimetype?: string,
  ): Promise<{ waMessageId: string }> {
    const sock = this.getConnectedSocket(sessionId);
    const result = await sock.sendMessage(remoteJid, {
      image: imageBuffer,
      caption,
      mimetype: mimetype ?? 'image/jpeg',
    });
    return { waMessageId: result?.key?.id ?? '' };
  }

  async sendAudio(sessionId: string, remoteJid: string, audioBuffer: Buffer, ptt = false): Promise<{ waMessageId: string }> {
    const sock = this.getConnectedSocket(sessionId);
    const result = await sock.sendMessage(remoteJid, {
      audio: audioBuffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt,
    });
    return { waMessageId: result?.key?.id ?? '' };
  }

  async sendVideo(
    sessionId: string,
    remoteJid: string,
    videoBuffer: Buffer,
    caption?: string,
  ): Promise<{ waMessageId: string }> {
    const sock = this.getConnectedSocket(sessionId);
    const result = await sock.sendMessage(remoteJid, {
      video: videoBuffer,
      caption,
    });
    return { waMessageId: result?.key?.id ?? '' };
  }

  async sendDocument(
    sessionId: string,
    remoteJid: string,
    docBuffer: Buffer,
    filename: string,
    mimetype: string,
  ): Promise<{ waMessageId: string }> {
    const sock = this.getConnectedSocket(sessionId);
    const result = await sock.sendMessage(remoteJid, {
      document: docBuffer,
      mimetype,
      fileName: filename,
    });
    return { waMessageId: result?.key?.id ?? '' };
  }

  async startSession(sessionId: string): Promise<SessionPublicState> {
    const sid = sessionId.trim();
    if (!sid) {
      throw new Error('sessionId vazio');
    }

    const isNew = !this.sessions.has(sid);
    if (isNew && this.sessions.size >= this.deps.maxSessions) {
      throw new SessionLimitError(this.deps.maxSessions);
    }

    const entry = this.ensureEntry(sid);
    entry.stopRequested = false;

    if (entry.socket && entry.connection === 'open') {
      return this.toPublic(entry);
    }

    if (entry.socket) {
      try {
        entry.socket.end(undefined);
      } catch {
        /* ignore */
      }
      entry.socket = undefined;
    }

    entry.connection = 'connecting';
    entry.qr = null;
    entry.lastErrorMessage = undefined;

    this.deps.eventBus.emitSession(sid, { type: 'connection', status: 'connecting' });

    const { state, saveCreds } = await this.deps.authProvider.loadState(sid);
    const versionInfo = await fetchLatestBaileysVersion().catch(() => null);
    const logger = this.deps.logger.child({ sessionId: sid, mod: 'baileys' });

    const sock = makeWASocket({
      auth: state,
      logger,
      ...(versionInfo?.version ? { version: versionInfo.version } : {}),
    });

    entry.socket = sock;
    entry.saveCreds = saveCreds;

    sock.ev.on('creds.update', saveCreds);

    if (this.deps.skipBuiltinMessagePipeline) {
      const hook = this.deps.onSocketReady;
      if (hook) {
        void Promise.resolve(hook({ socket: sock, sessionId: sid, logger })).catch((err) => {
          logger.error({ err }, 'onSocketReady falhou');
        });
      }
    } else {
      attachMessagePipeline(
        sock,
        sid,
        logger,
        this.deps.eventBus,
        this.deps.onMessage,
        this.deps.onMedia,
      );
    }

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        entry.qr = qr;
        this.deps.eventBus.emitSession(sid, { type: 'qr', qr });
      }

      if (connection === 'close') {
        entry.connection = 'close';
        entry.qr = null;
        const meta = disconnectMeta(lastDisconnect?.error);
        entry.lastDisconnectReason = meta.statusCode;
        entry.lastErrorMessage = meta.message;

        this.deps.eventBus.emitSession(sid, { type: 'connection', status: 'close' });

        const shouldReconnect =
          meta.statusCode !== DisconnectReason.loggedOut && !entry.stopRequested;

        entry.socket = undefined;

        if (shouldReconnect) {
          void this.startSession(sid).catch((reErr) => {
            logger.error({ err: reErr }, 'falha ao reconectar sessão WA');
          });
        }
        return;
      }

      if (connection === 'open') {
        entry.connection = 'open';
        entry.qr = null;
        const me = sock.user;
        entry.loggedInUser = me ? { id: me.id, name: me.name ?? undefined } : null;
        this.deps.eventBus.emitSession(sid, {
          type: 'connection',
          status: 'open',
          user: entry.loggedInUser ?? undefined,
        });
      }
    });

    return this.toPublic(entry);
  }

  shutdownAllSockets(): void {
    for (const entry of this.sessions.values()) {
      entry.stopRequested = true;
      try {
        entry.socket?.end(undefined);
      } catch {
        /* ignore */
      }
      entry.socket = undefined;
      entry.connection = 'close';
    }
  }

  async stopSession(
    sessionId: string,
    opts: { logoutRemote?: boolean; clearAuth?: boolean } = {},
  ): Promise<void> {
    const sid = sessionId.trim();
    const entry = this.sessions.get(sid);
    if (!entry) return;

    entry.stopRequested = true;
    entry.qr = null;

    const sock = entry.socket;
    entry.socket = undefined;
    entry.connection = 'close';

    if (sock) {
      try {
        if (opts.logoutRemote) {
          await sock.logout();
        } else {
          sock.end(undefined);
        }
      } catch {
        /* ignore */
      }
    }

    if (opts.clearAuth) {
      await this.deps.authProvider.clearState(sid);
    }
  }
}
