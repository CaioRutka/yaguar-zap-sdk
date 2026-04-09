/**
 * Limites padrão para validação local de payloads de envio.
 * O WhatsApp/Baileys ainda pode recusar mensagens além destes checks.
 */
export type OutgoingLimits = {
  /** Tamanho máximo do texto (caracteres). */
  maxTextLength: number;
  /** Tamanho máximo de `Buffer` para image, audio, video, document. */
  maxMediaBytes: number;
};

export const DEFAULT_OUTGOING_LIMITS: OutgoingLimits = {
  maxTextLength: 65_536,
  maxMediaBytes: 64 * 1024 * 1024,
};

export function mergeOutgoingLimits(partial?: Partial<OutgoingLimits>): OutgoingLimits {
  return {
    maxTextLength: partial?.maxTextLength ?? DEFAULT_OUTGOING_LIMITS.maxTextLength,
    maxMediaBytes: partial?.maxMediaBytes ?? DEFAULT_OUTGOING_LIMITS.maxMediaBytes,
  };
}
