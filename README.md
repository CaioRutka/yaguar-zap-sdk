# @yaguar/whatsapp-sdk

Biblioteca leve para **WhatsApp Web** via [Baileys](https://github.com/WhiskeySockets/Baileys) (`@whiskeysockets/baileys`).  
Não inclui servidor HTTP, ORM, MongoDB, dotenv nem storage — o host (ex.: CRM Yaguar) define persistência e configuração.

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [docs/overview.md](./docs/overview.md) | Escopo do pacote, fluxo de sessão, o que não está incluído. |
| [docs/messaging.md](./docs/messaging.md) | API unificada `sendOutgoing` / `trySendOutgoing`, `kind`, limites. |
| [docs/errors.md](./docs/errors.md) | Códigos de erro e sugestão de mapeamento HTTP. |
| [docs/integration.md](./docs/integration.md) | Como encaixar no backend/CRM. |

## Requisitos

- Node.js **>= 20**
- Projeto consumidor em **ESM** (`"type": "module"` ou imports `.mjs`)

## Instalação

```bash
npm install @yaguar/whatsapp-sdk
```

Dependências de runtime: `@whiskeysockets/baileys`, `pino`, `async-mutex`.

## Uso rápido

```typescript
import { WhatsAppClient, MemoryAuthStateProvider } from '@yaguar/whatsapp-sdk';

const auth = new MemoryAuthStateProvider();

const client = new WhatsAppClient({
  authProvider: auth,
  maxSessions: 50,
  logLevel: 'info',
  outgoingLimits: { maxMediaBytes: 32 * 1024 * 1024 }, // opcional
  onMessage: async (msg) => {
    console.log('mensagem', msg.sessionId, msg.text);
  },
  onMedia: async (media) => {
    console.log('mídia', media.waMessageId, media.mimetype, media.buffer.length);
  },
});

const unsub = client.on('minha-sessao', (ev) => {
  if (ev.type === 'qr') console.log('QR:', ev.qr);
  if (ev.type === 'connection') console.log('conexão', ev.status);
});

await client.connect('minha-sessao');

// API unificada (payload com `kind`)
await client.sendOutgoing('minha-sessao', {
  kind: 'text',
  to: '5541999999999',
  body: 'Olá!',
});

// Sem exceções: validação + erros do SDK como resultado
const out = await client.trySendOutgoing('minha-sessao', {
  kind: 'text',
  to: '5541999999999',
  body: 'Olá',
  typingSimulation: true,
});
if (!out.ok) {
  if ('issues' in out) console.error(out.issues);
  else console.error(out.error);
}

// API legada (ainda suportada)
await client.sendText('minha-sessao', '5541999999999', 'Olá!');
await client.sendTextWithTyping('minha-sessao', '5541999999999', 'Texto longo…');

unsub();
await client.disconnect('minha-sessao', { logout: false, clearAuth: false });
client.shutdownAll();
```

`MemoryAuthStateProvider` **não persiste** entre reinícios — útil para testes. Em produção, implemente `AuthStateProvider` (Mongo, Redis, disco, etc.).

## Duas formas de envio

| Estilo | Quando usar |
|--------|-------------|
| **Unificado** — `sendOutgoing` / `trySendOutgoing` + objeto `{ kind, ... }` | Contrato único, validação prévia, menos parâmetros espalhados. |
| **Legado** — `sendText`, `sendImage`, … | Integrações existentes ou controle fino direto de `Buffer` e flags. |

Validação **sem lançar**:

```typescript
import { validateOutgoingMessage, DEFAULT_OUTGOING_LIMITS } from '@yaguar/whatsapp-sdk';

const v = validateOutgoingMessage(payload, DEFAULT_OUTGOING_LIMITS);
if (!v.ok) {
  return res.status(422).json({ issues: v.issues });
}
```

Detalhes dos `kind` e limites: [docs/messaging.md](./docs/messaging.md).

## API principal — `WhatsAppClient`

| Método | Descrição |
|--------|-----------|
| `connect(sessionId)` | Inicia (ou retoma) socket Baileys; retorna `SessionPublicState`. |
| `on(sessionId, handler)` | Inscreve em eventos (`qr`, `connection`, `message`); retorna `unsub`. |
| `getState` / `listStates` | Estado atual das sessões em memória. |
| `sendOutgoing(sessionId, payload)` | Valida payload unificado e envia; lança `OutgoingValidationError` se inválido. |
| `trySendOutgoing(sessionId, payload)` | Igual, mas retorna `{ ok, waMessageId }` ou `{ ok: false, issues }` / `{ error }`. |
| `sendText` / `sendTextWithTyping` / `sendImage` / `sendAudio` / `sendVideo` / `sendDocument` | Envio legado; JID numérico é normalizado para `@s.whatsapp.net`. |
| `disconnect(sessionId, opts?)` | `logout?: boolean`, `clearAuth?: boolean`. |
| `shutdownAll()` | Encerra todos os sockets. |
| `getEventBus()` | `SessionEventBus` para SSE/WebSocket. |
| `getSessionManager()` | Acesso avançado ao `SessionManager`. |

## Opções — `WhatsAppClientOptions`

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `authProvider` | sim | `AuthStateProvider`. |
| `onMessage` | não | Callback por mensagem recebida. |
| `onMedia` | não | Se definido, baixa buffer e chama após `onMessage`. |
| `skipBuiltinMessagePipeline` | não | Com `onSocketReady` para pipeline próprio. |
| `onSocketReady` | não | Hook com `socket` bruto (ingestão CRM). |
| `maxSessions` | não | Padrão `50`. |
| `logLevel` / `logger` | não | Pino. |
| `outgoingLimits` | não | Parcial sobre `DEFAULT_OUTGOING_LIMITS` para `sendOutgoing` / `trySendOutgoing`. |

## Eventos — `SessionEvent`

- `{ type: 'qr', qr: string }`
- `{ type: 'connection', status: 'connecting' \| 'open' \| 'close', user? }`
- `{ type: 'message', message: IncomingMessage }`
- `{ type: 'chat.update', chat: Record<string, unknown> }` (reservado / futuro)

## Providers

### `AuthStateProvider`

Persistência do estado Baileys (`loadState` / `clearState`). Ver [docs/integration.md](./docs/integration.md).

### `MessageHandler` / `MediaHandler`

- `IncomingMessage` — id, JIDs, texto/resumo, flags de mídia, `upsertType`, etc.
- `MediaDownload` — `buffer`, `mimetype`, `fileName`, ids.

## Erros

| Classe | `code` |
|--------|--------|
| `WhatsAppSDKError` | (base) |
| `InvalidJidError` | `INVALID_JID` |
| `SessionNotConnectedError` | `WA_NOT_CONNECTED` |
| `SessionLimitError` | `MAX_SESSIONS` |
| `SendIncompleteError` | `WA_SEND_INCOMPLETE` |
| `OutgoingValidationError` | `INVALID_OUTGOING` |

`isWhatsAppSDKError(err)` — o pacote não define status HTTP; mapeie no host. Ver [docs/errors.md](./docs/errors.md).

## Exportações úteis

- `validateOutgoingMessage`, `mergeOutgoingLimits`, `DEFAULT_OUTGOING_LIMITS`
- Tipos: `OutgoingMessagePayload`, `OutgoingIssue`, `TrySendOutgoingResult`, `OutgoingLimits`, …

## Nota: Baileys vs Meta Cloud API

Este SDK usa o **protocolo WhatsApp Web** (Baileys), não a **WhatsApp Cloud API** oficial da Meta (Graph). Para Cloud API seria outro pacote e outro contrato.

## Desenvolvimento

```bash
npm install
npm run build
npm test
```

Saída em `dist/` (ESM + `.d.ts`).

## Licença

UNLICENSED (uso interno Yaguar, salvo acordo em contrário).
