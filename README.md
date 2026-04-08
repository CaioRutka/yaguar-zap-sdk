# @yaguar/whatsapp-sdk

Biblioteca leve para **WhatsApp Web** via [Baileys](https://github.com/WhiskeySockets/Baileys) (`@whiskeysockets/baileys`).  
Não inclui servidor HTTP, ORM, MongoDB, dotenv nem storage — o host (ex.: CRM Yaguar) define persistência e configuração.

## Requisitos

- Node.js **>= 20**
- Projeto consumidor em **ESM** (`"type": "module"` ou imports `.mjs`)

## Instalação

```bash
npm install @yaguar/whatsapp-sdk
```

Dependências de runtime (instaladas automaticamente): `@whiskeysockets/baileys`, `pino`, `async-mutex`.

## Uso rápido

```typescript
import { WhatsAppClient, MemoryAuthStateProvider } from '@yaguar/whatsapp-sdk';

const auth = new MemoryAuthStateProvider();

const client = new WhatsAppClient({
  authProvider: auth,
  maxSessions: 50,
  logLevel: 'info',
  onMessage: async (msg) => {
    console.log('mensagem', msg.sessionId, msg.text);
  },
  onMedia: async (media) => {
    // opcional: upload, salvar em disco, etc.
    console.log('mídia', media.waMessageId, media.mimetype, media.buffer.length);
  },
});

const unsub = client.on('minha-sessao', (ev) => {
  if (ev.type === 'qr') console.log('QR:', ev.qr);
  if (ev.type === 'connection') console.log('conexão', ev.status);
});

await client.connect('minha-sessao');

await client.sendText('minha-sessao', '5541999999999', 'Olá!');
await client.sendTextWithTyping('minha-sessao', '5541999999999', 'Texto longo com simulação de digitação…');

unsub();
await client.disconnect('minha-sessao', { logout: false, clearAuth: false });
client.shutdownAll();
```

`MemoryAuthStateProvider` **não persiste** entre reinícios — útil para testes. Em produção, implemente `AuthStateProvider` (Mongo, Redis, disco, etc.).

## API principal — `WhatsAppClient`

| Método | Descrição |
|--------|-----------|
| `connect(sessionId)` | Inicia (ou retoma) socket Baileys; retorna `SessionPublicState`. |
| `on(sessionId, handler)` | Inscreve em eventos (`qr`, `connection`, `message`); retorna função `unsub`. |
| `getState(sessionId)` / `listStates()` | Estado atual das sessões em memória. |
| `sendText` / `sendTextWithTyping` / `sendImage` / `sendAudio` / `sendVideo` / `sendDocument` | Envio; JID numérico é normalizado para `@s.whatsapp.net`. |
| `disconnect(sessionId, opts?)` | `logout?: boolean` (logout remoto), `clearAuth?: boolean` (limpa provider). |
| `shutdownAll()` | Encerra todos os sockets (shutdown do processo). |
| `getEventBus()` | `SessionEventBus` para integrar com SSE/WebSocket. |
| `getSessionManager()` | Acesso avançado ao `SessionManager`. |

## Opções — `WhatsAppClientOptions`

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `authProvider` | sim | Implementação de `AuthStateProvider`. |
| `onMessage` | não | Callback por mensagem recebida (payload mínimo). |
| `onMedia` | não | Se definido, o SDK baixa o buffer e chama após `onMessage`. |
| `skipBuiltinMessagePipeline` | não | Se `true`, não registra `messages.upsert` interno; use com `onSocketReady`. |
| `onSocketReady` | não | Chamado após criar o socket: `{ socket, sessionId, logger }` — ex.: anexar ingestão com `WAMessage` bruto (CRM). |
| `maxSessions` | não | Padrão `50`. |
| `logLevel` | não | Padrão `info` (Pino). |
| `logger` | não | Instância Pino customizada. |

## Eventos — `SessionEvent`

- `{ type: 'qr', qr: string }`
- `{ type: 'connection', status: 'connecting' \| 'open' \| 'close', user? }`
- `{ type: 'message', message: IncomingMessage }`
- `{ type: 'chat.update', chat: Record<string, unknown> }` (reservado / futuro)

## Providers

### `AuthStateProvider`

Responsável por carregar e salvar o estado de autenticação Baileys (equivalente a `useMultiFileAuthState`).

```typescript
import type { AuthenticationState } from '@whiskeysockets/baileys';
import type { AuthStateProvider } from '@yaguar/whatsapp-sdk';

// loadState(sessionId) → { state: AuthenticationState; saveCreds: () => Promise<void> }
// clearState(sessionId) → Promise<void>
```

No backend Yaguar atual, a lógica em `useMongoAuthState` pode ser encapsulada numa classe que implementa essa interface.

### `MessageHandler` / `MediaHandler`

Tipos exportados:

- `IncomingMessage` — id, JIDs, texto/resumo, flags de mídia, `upsertType`, etc.
- `MediaDownload` — `buffer`, `mimetype`, `fileName`, ids.

## Erros

| Classe | `code` |
|--------|--------|
| `WhatsAppSDKError` | (base) |
| `SessionNotConnectedError` | `WA_NOT_CONNECTED` |
| `SessionLimitError` | `MAX_SESSIONS` |
| `InvalidJidError` | `INVALID_JID` |
| `SendIncompleteError` | `WA_SEND_INCOMPLETE` |

Use `isWhatsAppSDKError(err)` para narrowing. **Não** há status HTTP — mapeie no Express/Fastify/etc.

## Utilitários

- `normalizeWhatsAppJid(raw: string): string` — dígitos → `@s.whatsapp.net`.

## Nota: Baileys vs Meta Cloud API

Este SDK usa o **protocolo WhatsApp Web** (Baileys), não a **WhatsApp Cloud API** oficial da Meta (Graph). Para Cloud API seria outro pacote e outro contrato.

## Build local

```bash
npm install
npm run build
```

Saída em `dist/` (ESM + `.d.ts`).

## Licença

UNLICENSED (uso interno Yaguar, salvo acordo em contrário).
