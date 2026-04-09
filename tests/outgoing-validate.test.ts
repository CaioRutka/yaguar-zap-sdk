import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OutgoingValidationError,
  SessionNotConnectedError,
} from '../src/errors.js';
import { WhatsAppClient } from '../src/client.js';
import { MemoryAuthStateProvider } from '../src/providers/memory-auth-state.js';
import {
  DEFAULT_OUTGOING_LIMITS,
  mergeOutgoingLimits,
  validateOutgoingMessage,
} from '../src/outgoing/index.js';
import type {
  OutgoingIssue,
  ValidateOutgoingOk,
  ValidateOutgoingResult,
} from '../src/outgoing/types.js';
import { validateToField } from '../src/outgoing/validate.js';

const limits = DEFAULT_OUTGOING_LIMITS;

/** Garante resultado inválido e devolve issues para asserções encadeadas. */
function expectInvalid(r: ValidateOutgoingResult): OutgoingIssue[] {
  assert.equal(r.ok, false, 'esperado ok: false');
  if (r.ok) {
    throw new assert.AssertionError({ message: 'expected validation failure' });
  }
  assert.ok(Array.isArray(r.issues) && r.issues.length > 0, 'issues não vazias');
  return r.issues;
}

function expectValid(r: ValidateOutgoingResult): asserts r is ValidateOutgoingOk {
  if (!r.ok) {
    throw new assert.AssertionError({
      message: `expected success, got issues: ${JSON.stringify(r.issues)}`,
    });
  }
}

function hasIssue(issues: OutgoingIssue[], path: string, code?: string): boolean {
  return issues.some((i) => i.path === path && (code === undefined || i.code === code));
}

function makeClient(): WhatsAppClient {
  return new WhatsAppClient({ authProvider: new MemoryAuthStateProvider() });
}

describe('validateToField', () => {
  it('registra REQUIRED para string vazia', () => {
    const issues: OutgoingIssue[] = [];
    validateToField('', issues);
    assert.ok(hasIssue(issues, 'to', 'REQUIRED'));
  });

  it('registra INVALID_TYPE quando não é string', () => {
    const issues: OutgoingIssue[] = [];
    validateToField(123 as unknown as string, issues);
    assert.ok(hasIssue(issues, 'to', 'INVALID_TYPE'));
  });

  it('aceita JID com @ sem dígitos isolados', () => {
    const issues: OutgoingIssue[] = [];
    validateToField('foo@lid', issues);
    assert.equal(issues.length, 0);
  });

  it('aceita número só com dígitos', () => {
    const issues: OutgoingIssue[] = [];
    validateToField('5511999999999', issues);
    assert.equal(issues.length, 0);
  });

  it('aceita número com máscara (normaliza dígitos na validação de conteúdo)', () => {
    const issues: OutgoingIssue[] = [];
    validateToField('+55 (11) 99999-9999', issues);
    assert.equal(issues.length, 0);
  });

  it('registra INVALID_JID quando não há @ nem dígitos', () => {
    const issues: OutgoingIssue[] = [];
    validateToField('abc', issues);
    assert.ok(hasIssue(issues, 'to', 'INVALID_JID'));
  });
});

describe('validateOutgoingMessage', () => {
  describe('envelope do payload', () => {
    it('rejeita null', () => {
      const issues = expectInvalid(validateOutgoingMessage(null, limits));
      assert.ok(hasIssue(issues, '', 'INVALID_PAYLOAD'));
    });

    it('rejeita array', () => {
      const issues = expectInvalid(validateOutgoingMessage([], limits));
      assert.ok(hasIssue(issues, '', 'INVALID_PAYLOAD'));
    });

    it('rejeita kind ausente ou inválido', () => {
      const issues1 = expectInvalid(validateOutgoingMessage({ to: '1', body: 'x' }, limits));
      assert.ok(hasIssue(issues1, 'kind', 'INVALID_KIND'));

      const issues2 = expectInvalid(validateOutgoingMessage({ kind: 'sticker', to: '1' }, limits));
      assert.ok(hasIssue(issues2, 'kind', 'INVALID_KIND'));
    });
  });

  describe('kind: text', () => {
    it('aceita texto mínimo e preserva typingSimulation', () => {
      const r = validateOutgoingMessage(
        {
          kind: 'text',
          to: '5511999999999',
          body: 'Olá',
          typingSimulation: true,
        },
        limits,
      );
      expectValid(r);
      assert.equal(r.value.kind, 'text');
      assert.equal(r.value.body, 'Olá');
      assert.equal(r.value.typingSimulation, true);
      assert.equal(r.value.to, '5511999999999');
    });

    it('omite typingSimulation quando undefined', () => {
      const r = validateOutgoingMessage(
        { kind: 'text', to: '5511', body: 'x' },
        limits,
      );
      expectValid(r);
      assert.equal(r.value.kind, 'text');
      assert.equal(r.value.typingSimulation, undefined);
    });

    it('rejeita body vazio, não-string e typingSimulation inválido', () => {
      const emptyBody = expectInvalid(
        validateOutgoingMessage({ kind: 'text', to: '5511', body: '' }, limits),
      );
      assert.ok(hasIssue(emptyBody, 'body', 'REQUIRED'));

      const badBody = expectInvalid(
        validateOutgoingMessage({ kind: 'text', to: '5511', body: 1 as unknown as string }, limits),
      );
      assert.ok(hasIssue(badBody, 'body', 'INVALID_TYPE'));

      const badTyping = expectInvalid(
        validateOutgoingMessage(
          { kind: 'text', to: '5511', body: 'ok', typingSimulation: 'yes' as unknown as boolean },
          limits,
        ),
      );
      assert.ok(hasIssue(badTyping, 'typingSimulation', 'INVALID_TYPE'));
    });

    it('rejeita TEXT_TOO_LONG', () => {
      const small = mergeOutgoingLimits({ maxTextLength: 3 });
      const issues = expectInvalid(
        validateOutgoingMessage({ kind: 'text', to: '5511', body: 'abcd' }, small),
      );
      assert.ok(hasIssue(issues, 'body', 'TEXT_TOO_LONG'));
    });

    it('acumula erro em to e body quando ambos inválidos', () => {
      const issues = expectInvalid(
        validateOutgoingMessage({ kind: 'text', to: '', body: '' }, limits),
      );
      assert.ok(hasIssue(issues, 'to'));
      assert.ok(hasIssue(issues, 'body'));
    });
  });

  describe('kind: image', () => {
    it('aceita buffer com caption e mimetype', () => {
      const r = validateOutgoingMessage(
        {
          kind: 'image',
          to: '5511',
          data: Buffer.from([0xff, 0xd8, 0xff]),
          caption: 'foto',
          mimetype: 'image/png',
        },
        limits,
      );
      expectValid(r);
      assert.equal(r.value.kind, 'image');
      assert.equal(r.value.caption, 'foto');
      assert.equal(r.value.mimetype, 'image/png');
    });

    it('rejeita data ausente, não-Buffer, vazio e muito grande', () => {
      const noData = expectInvalid(
        validateOutgoingMessage({ kind: 'image', to: '5511' } as Record<string, unknown>, limits),
      );
      assert.ok(hasIssue(noData, 'data', 'INVALID_TYPE'));

      const notBuf = expectInvalid(
        validateOutgoingMessage(
          { kind: 'image', to: '5511', data: new Uint8Array([1]) as unknown as Buffer },
          limits,
        ),
      );
      assert.ok(hasIssue(notBuf, 'data', 'INVALID_TYPE'));

      const empty = expectInvalid(
        validateOutgoingMessage({ kind: 'image', to: '5511', data: Buffer.alloc(0) }, limits),
      );
      assert.ok(hasIssue(empty, 'data', 'REQUIRED'));

      const tinyLimit = mergeOutgoingLimits({ maxMediaBytes: 2 });
      const tooBig = expectInvalid(
        validateOutgoingMessage(
          { kind: 'image', to: '5511', data: Buffer.from([1, 2, 3]) },
          tinyLimit,
        ),
      );
      assert.ok(hasIssue(tooBig, 'data', 'MEDIA_TOO_LARGE'));
    });

    it('rejeita caption ou mimetype com tipo errado', () => {
      const badCaption = expectInvalid(
        validateOutgoingMessage(
          { kind: 'image', to: '5511', data: Buffer.from([1]), caption: 1 as unknown as string },
          limits,
        ),
      );
      assert.ok(hasIssue(badCaption, 'caption', 'INVALID_TYPE'));
    });
  });

  describe('kind: audio', () => {
    it('aceita voiceNote true', () => {
      const r = validateOutgoingMessage(
        { kind: 'audio', to: '5511', data: Buffer.from([1, 2]), voiceNote: true },
        limits,
      );
      expectValid(r);
      assert.equal(r.value.kind, 'audio');
      assert.equal(r.value.voiceNote, true);
    });

    it('rejeita voiceNote não-boolean', () => {
      const issues = expectInvalid(
        validateOutgoingMessage(
          { kind: 'audio', to: '5511', data: Buffer.from([1]), voiceNote: 1 as unknown as boolean },
          limits,
        ),
      );
      assert.ok(hasIssue(issues, 'voiceNote', 'INVALID_TYPE'));
    });
  });

  describe('kind: video', () => {
    it('aceita com caption', () => {
      const r = validateOutgoingMessage(
        { kind: 'video', to: '5511', data: Buffer.from([0, 1]), caption: 'clip' },
        limits,
      );
      expectValid(r);
      assert.equal(r.value.kind, 'video');
      assert.equal(r.value.caption, 'clip');
    });

    it('rejeita caption inválida', () => {
      const issues = expectInvalid(
        validateOutgoingMessage(
          { kind: 'video', to: '5511', data: Buffer.from([1]), caption: [] as unknown as string },
          limits,
        ),
      );
      assert.ok(hasIssue(issues, 'caption', 'INVALID_TYPE'));
    });
  });

  describe('kind: document', () => {
    it('aceita filename e mimetype válidos', () => {
      const r = validateOutgoingMessage(
        {
          kind: 'document',
          to: '5511',
          data: Buffer.from('%PDF'),
          filename: 'a.pdf',
          mimetype: 'application/pdf',
        },
        limits,
      );
      expectValid(r);
      assert.equal(r.value.kind, 'document');
      assert.equal(r.value.filename, 'a.pdf');
      assert.equal(r.value.mimetype, 'application/pdf');
    });

    it('rejeita filename / mimetype vazios ou só espaço', () => {
      const issues = expectInvalid(
        validateOutgoingMessage(
          {
            kind: 'document',
            to: '5511',
            data: Buffer.from('x'),
            filename: '   ',
            mimetype: 'application/pdf',
          },
          limits,
        ),
      );
      assert.ok(hasIssue(issues, 'filename', 'REQUIRED'));

      const issues2 = expectInvalid(
        validateOutgoingMessage(
          {
            kind: 'document',
            to: '5511',
            data: Buffer.from('x'),
            filename: 'f.txt',
            mimetype: '  ',
          },
          limits,
        ),
      );
      assert.ok(hasIssue(issues2, 'mimetype', 'REQUIRED'));
    });
  });
});

describe('mergeOutgoingLimits', () => {
  it('mescla só maxTextLength', () => {
    const m = mergeOutgoingLimits({ maxTextLength: 100 });
    assert.equal(m.maxTextLength, 100);
    assert.equal(m.maxMediaBytes, DEFAULT_OUTGOING_LIMITS.maxMediaBytes);
  });

  it('mescla só maxMediaBytes', () => {
    const m = mergeOutgoingLimits({ maxMediaBytes: 1024 });
    assert.equal(m.maxMediaBytes, 1024);
    assert.equal(m.maxTextLength, DEFAULT_OUTGOING_LIMITS.maxTextLength);
  });

  it('undefined não sobrescreve defaults', () => {
    const m = mergeOutgoingLimits({ maxTextLength: undefined, maxMediaBytes: undefined });
    assert.deepEqual(m, DEFAULT_OUTGOING_LIMITS);
  });
});

describe('WhatsAppClient — sendOutgoing / trySendOutgoing', () => {
  it('sendOutgoing lança OutgoingValidationError com issues', async () => {
    const client = makeClient();
    await assert.rejects(
      () => client.sendOutgoing('s1', { kind: 'text', to: '', body: 'x' }),
      (err: unknown) => {
        assert.ok(err instanceof OutgoingValidationError);
        assert.equal(err.code, 'INVALID_OUTGOING');
        assert.ok(Array.isArray(err.issues) && err.issues.length > 0);
        return true;
      },
    );
  });

  it('trySendOutgoing retorna issues quando payload inválido', async () => {
    const client = makeClient();
    const r = await client.trySendOutgoing('s1', { kind: 'text', to: '', body: 'x' });
    assert.equal(r.ok, false);
    assert.ok('issues' in r && r.issues.length > 0);
    assert.ok(!('error' in r && r.error));
  });

  it('trySendOutgoing retorna SessionNotConnectedError quando válido mas offline', async () => {
    const client = makeClient();
    const r = await client.trySendOutgoing('s1', {
      kind: 'text',
      to: '5511999999999',
      body: 'hi',
    });
    assert.equal(r.ok, false);
    assert.ok('error' in r && r.error instanceof SessionNotConnectedError);
    assert.equal(r.error.code, 'WA_NOT_CONNECTED');
  });

  it('trySendOutgoing retorna issues para to sem dígitos (antes do socket)', async () => {
    const client = makeClient();
    const r = await client.trySendOutgoing('s1', {
      kind: 'text',
      to: 'não-é-jid',
      body: 'hi',
    });
    assert.equal(r.ok, false);
    assert.ok('issues' in r && hasIssue(r.issues, 'to', 'INVALID_JID'));
  });

  it('sendOutgoing com payload válido lança SessionNotConnectedError sem sessão conectada', async () => {
    const client = makeClient();
    await assert.rejects(
      () => client.sendOutgoing('s1', { kind: 'text', to: '5511999999999', body: 'x' }),
      (err: unknown) => err instanceof SessionNotConnectedError,
    );
  });
});
