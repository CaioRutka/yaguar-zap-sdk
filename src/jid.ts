import { InvalidJidError } from './errors.js';

/**
 * Normaliza JID para envio: número só dígitos → `@s.whatsapp.net`; já com `@` → inalterado.
 */
export function normalizeWhatsAppJid(raw: string): string {
  const t = raw.trim();
  if (!t) {
    throw new InvalidJidError('remoteJid obrigatório');
  }
  if (t.includes('@')) {
    return t;
  }
  const digits = t.replace(/\D/g, '');
  if (!digits) {
    throw new InvalidJidError('remoteJid deve conter dígitos ou um JID completo');
  }
  return `${digits}@s.whatsapp.net`;
}
