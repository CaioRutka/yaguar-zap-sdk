/**
 * Payload mínimo de mensagem recebida (antes de download de mídia).
 */
export type IncomingMessage = {
  sessionId: string;
  waMessageId: string;
  remoteJid: string;
  /** JID alternativo quando o WhatsApp envia @lid */
  remoteJidAlt?: string;
  fromMe: boolean;
  pushName?: string;
  timestamp: Date;
  contentType?: string;
  text?: string;
  hasMedia: boolean;
  mediaMimetype?: string;
  documentFileName?: string;
  /** Tipo do upsert Baileys: append | notify */
  upsertType?: string;
};

export type MessageHandler = (message: IncomingMessage) => void | Promise<void>;
