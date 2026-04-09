/**
 * Payloads discriminados para envio de alto nível (`sendOutgoing` / `validateOutgoingMessage`).
 */
export type OutgoingIssue = {
  /** Caminho do campo (ex.: `to`, `body`, `data`). */
  path: string;
  /** Código estável para i18n ou mapeamento HTTP. */
  code: string;
  message: string;
};

export type OutgoingTextPayload = {
  kind: 'text';
  to: string;
  body: string;
  /** Se true, usa simulação de digitação antes do envio. */
  typingSimulation?: boolean;
};

export type OutgoingImagePayload = {
  kind: 'image';
  to: string;
  data: Buffer;
  caption?: string;
  /** Padrão no envio Baileys: `image/jpeg` quando omitido. */
  mimetype?: string;
};

export type OutgoingAudioPayload = {
  kind: 'audio';
  to: string;
  data: Buffer;
  /** Mensagem de voz (PTT). Padrão: false. */
  voiceNote?: boolean;
};

export type OutgoingVideoPayload = {
  kind: 'video';
  to: string;
  data: Buffer;
  caption?: string;
};

export type OutgoingDocumentPayload = {
  kind: 'document';
  to: string;
  data: Buffer;
  filename: string;
  mimetype: string;
};

export type OutgoingMessagePayload =
  | OutgoingTextPayload
  | OutgoingImagePayload
  | OutgoingAudioPayload
  | OutgoingVideoPayload
  | OutgoingDocumentPayload;

export type ValidateOutgoingOk = { ok: true; value: OutgoingMessagePayload };
export type ValidateOutgoingErr = { ok: false; issues: OutgoingIssue[] };
export type ValidateOutgoingResult = ValidateOutgoingOk | ValidateOutgoingErr;

/** Resultado de `trySendOutgoing` (sem exceção em validação ou erro conhecido do SDK). */
export type TrySendOutgoingSuccess = { ok: true; waMessageId: string };
export type TrySendOutgoingFailure =
  | { ok: false; issues: OutgoingIssue[] }
  | { ok: false; error: Error };
export type TrySendOutgoingResult = TrySendOutgoingSuccess | TrySendOutgoingFailure;
