import type { OutgoingLimits } from './limits.js';
import type {
  OutgoingIssue,
  OutgoingMessagePayload,
  ValidateOutgoingResult,
} from './types.js';

function pushIssue(issues: OutgoingIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

/**
 * Valida `to` como número (apenas dígitos) ou JID completo (`...@...`).
 * Não normaliza; use `normalizeWhatsAppJid` após sucesso.
 */
export function validateToField(to: unknown, issues: OutgoingIssue[]): void {
  if (typeof to !== 'string') {
    pushIssue(issues, 'to', 'INVALID_TYPE', 'to deve ser string');
    return;
  }
  const t = to.trim();
  if (!t) {
    pushIssue(issues, 'to', 'REQUIRED', 'to é obrigatório');
    return;
  }
  if (t.includes('@')) {
    return;
  }
  const digits = t.replace(/\D/g, '');
  if (!digits) {
    pushIssue(issues, 'to', 'INVALID_JID', 'to deve conter dígitos ou um JID completo com @');
  }
}

function isBufferLike(data: unknown): data is Buffer {
  return Buffer.isBuffer(data);
}

/**
 * Valida um payload de envio sem lançar exceção.
 * Retorna `{ ok: true, value }` ou `{ ok: false, issues }`.
 */
export function validateOutgoingMessage(
  input: unknown,
  limits: OutgoingLimits,
): ValidateOutgoingResult {
  const issues: OutgoingIssue[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    pushIssue(issues, '', 'INVALID_PAYLOAD', 'payload deve ser um objeto');
    return { ok: false, issues };
  }

  const obj = input as Record<string, unknown>;
  const kind = obj.kind;

  if (kind !== 'text' && kind !== 'image' && kind !== 'audio' && kind !== 'video' && kind !== 'document') {
    pushIssue(issues, 'kind', 'INVALID_KIND', "kind deve ser 'text' | 'image' | 'audio' | 'video' | 'document'");
    return { ok: false, issues };
  }

  validateToField(obj.to, issues);

  if (kind === 'text') {
    if (typeof obj.body !== 'string') {
      pushIssue(issues, 'body', 'INVALID_TYPE', 'body deve ser string');
    } else if (obj.body.length === 0) {
      pushIssue(issues, 'body', 'REQUIRED', 'body não pode ser vazio');
    } else if (obj.body.length > limits.maxTextLength) {
      pushIssue(
        issues,
        'body',
        'TEXT_TOO_LONG',
        `body excede maxTextLength (${limits.maxTextLength})`,
      );
    }
    if (obj.typingSimulation !== undefined && typeof obj.typingSimulation !== 'boolean') {
      pushIssue(issues, 'typingSimulation', 'INVALID_TYPE', 'typingSimulation deve ser boolean');
    }
    if (issues.length) return { ok: false, issues };
    const value: OutgoingMessagePayload = {
      kind: 'text',
      to: String(obj.to).trim(),
      body: obj.body as string,
      typingSimulation: typeof obj.typingSimulation === 'boolean' ? obj.typingSimulation : undefined,
    };
    return { ok: true, value };
  }

  if (!isBufferLike(obj.data)) {
    pushIssue(issues, 'data', 'INVALID_TYPE', 'data deve ser Buffer');
  } else if (obj.data.length === 0) {
    pushIssue(issues, 'data', 'REQUIRED', 'data não pode ser vazio');
  } else if (obj.data.length > limits.maxMediaBytes) {
    pushIssue(
      issues,
      'data',
      'MEDIA_TOO_LARGE',
      `data excede maxMediaBytes (${limits.maxMediaBytes})`,
    );
  }

  if (kind === 'image') {
    if (obj.caption !== undefined && typeof obj.caption !== 'string') {
      pushIssue(issues, 'caption', 'INVALID_TYPE', 'caption deve ser string');
    }
    if (obj.mimetype !== undefined && typeof obj.mimetype !== 'string') {
      pushIssue(issues, 'mimetype', 'INVALID_TYPE', 'mimetype deve ser string');
    }
    if (issues.length) return { ok: false, issues };
    const value: OutgoingMessagePayload = {
      kind: 'image',
      to: String(obj.to).trim(),
      data: obj.data as Buffer,
      caption: typeof obj.caption === 'string' ? obj.caption : undefined,
      mimetype: typeof obj.mimetype === 'string' ? obj.mimetype : undefined,
    };
    return { ok: true, value };
  }

  if (kind === 'audio') {
    if (obj.voiceNote !== undefined && typeof obj.voiceNote !== 'boolean') {
      pushIssue(issues, 'voiceNote', 'INVALID_TYPE', 'voiceNote deve ser boolean');
    }
    if (issues.length) return { ok: false, issues };
    const value: OutgoingMessagePayload = {
      kind: 'audio',
      to: String(obj.to).trim(),
      data: obj.data as Buffer,
      voiceNote: typeof obj.voiceNote === 'boolean' ? obj.voiceNote : undefined,
    };
    return { ok: true, value };
  }

  if (kind === 'video') {
    if (obj.caption !== undefined && typeof obj.caption !== 'string') {
      pushIssue(issues, 'caption', 'INVALID_TYPE', 'caption deve ser string');
    }
    if (issues.length) return { ok: false, issues };
    const value: OutgoingMessagePayload = {
      kind: 'video',
      to: String(obj.to).trim(),
      data: obj.data as Buffer,
      caption: typeof obj.caption === 'string' ? obj.caption : undefined,
    };
    return { ok: true, value };
  }

  // document
  if (typeof obj.filename !== 'string' || !obj.filename.trim()) {
    pushIssue(issues, 'filename', 'REQUIRED', 'filename é obrigatório');
  }
  if (typeof obj.mimetype !== 'string' || !obj.mimetype.trim()) {
    pushIssue(issues, 'mimetype', 'REQUIRED', 'mimetype é obrigatório para document');
  }
  if (issues.length) return { ok: false, issues };
  const value: OutgoingMessagePayload = {
    kind: 'document',
    to: String(obj.to).trim(),
    data: obj.data as Buffer,
    filename: (obj.filename as string).trim(),
    mimetype: (obj.mimetype as string).trim(),
  };
  return { ok: true, value };
}
