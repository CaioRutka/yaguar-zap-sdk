export type MediaDownload = {
  sessionId: string;
  waMessageId: string;
  remoteJid: string;
  buffer: Buffer;
  mimetype: string;
  fileName?: string;
};

export type MediaHandler = (media: MediaDownload) => void | Promise<void>;
