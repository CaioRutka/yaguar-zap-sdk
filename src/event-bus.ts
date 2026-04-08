import { EventEmitter } from 'node:events';
import type { IncomingMessage } from './providers/message-handler.provider.js';

export type SessionEvent =
  | { type: 'qr'; qr: string }
  | {
      type: 'connection';
      status: 'connecting' | 'open' | 'close';
      user?: { id: string; name?: string };
    }
  | { type: 'message'; message: IncomingMessage }
  | { type: 'chat.update'; chat: Record<string, unknown> };

/**
 * Bus in-process por sessão. Desacopla Baileys de SSE/WebSocket no consumidor.
 */
export class SessionEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(500);
  }

  emitSession(sessionId: string, event: SessionEvent): void {
    this.emit(sessionId, event);
  }

  onSession(sessionId: string, handler: (event: SessionEvent) => void): () => void {
    this.on(sessionId, handler);
    return () => {
      this.off(sessionId, handler);
    };
  }
}
