# Mensagens de saída (API de alto nível)

Além dos métodos `sendText`, `sendImage`, etc., o SDK oferece um **payload discriminado** por `kind`, validação prévia e dois modos de envio:

| Método | Comportamento |
|--------|----------------|
| `validateOutgoingMessage(payload, limits)` | Puro; retorna `{ ok: true, value }` ou `{ ok: false, issues }` **sem lançar**. |
| `client.sendOutgoing(sessionId, payload)` | Valida → normaliza `to` → envia; lança `OutgoingValidationError` se inválido. |
| `client.trySendOutgoing(sessionId, payload)` | Valida sem throw; em falha de envio retorna `{ ok: false, error }` para erros `WhatsAppSDKError`. |

## Limites padrão (`DEFAULT_OUTGOING_LIMITS`)

| Campo | Default | Uso |
|-------|---------|-----|
| `maxTextLength` | `65536` | Tamanho máximo de `body` (texto). |
| `maxMediaBytes` | `67108864` (64 MiB) | Tamanho máximo do `Buffer` em image/audio/video/document. |

Personalize por client:

```typescript
const client = new WhatsAppClient({
  authProvider,
  outgoingLimits: { maxMediaBytes: 16 * 1024 * 1024, maxTextLength: 4096 },
});
```

Ou passe `mergeOutgoingLimits({ ... })` como segundo argumento **somente** para `validateOutgoingMessage` (função exportada); o client usa apenas `outgoingLimits` nas opções.

**Importante:** limites locais reduzem erros comuns; o WhatsApp/Baileys ainda pode recusar arquivos por política, formato ou tamanho real da rede.

## Contrato por `kind`

### `text`

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `kind` | sim | `'text'` |
| `to` | sim | Número (dígitos) ou JID completo (`...@s.whatsapp.net`, grupo, etc.). |
| `body` | sim | Texto não vazio, até `maxTextLength`. |
| `typingSimulation` | não | Se `true`, usa simulação de digitação antes do envio. |

### `image`

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `kind` | sim | `'image'` |
| `to` | sim | Idem texto. |
| `data` | sim | `Buffer` não vazio, até `maxMediaBytes`. |
| `caption` | não | Legenda. |
| `mimetype` | não | Se omitido, o envio Baileys usa `image/jpeg` (comportamento existente do socket). |

### `audio`

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `kind` | sim | `'audio'` |
| `to` | sim | Idem. |
| `data` | sim | `Buffer` (ogg/opus é o fluxo típico do Baileys no `SessionManager`). |
| `voiceNote` | não | Se `true`, envia como PTT (mensagem de voz). |

### `video`

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `kind` | sim | `'video'` |
| `to` | sim | Idem. |
| `data` | sim | `Buffer`. |
| `caption` | não | Legenda. |

### `document`

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `kind` | sim | `'document'` |
| `to` | sim | Idem. |
| `data` | sim | `Buffer`. |
| `filename` | sim | Nome do arquivo (string não vazia). |
| `mimetype` | sim | MIME, ex.: `application/pdf`. |

## Exemplos

```typescript
import {
  validateOutgoingMessage,
  DEFAULT_OUTGOING_LIMITS,
  WhatsAppClient,
} from '@yaguar/whatsapp-sdk';

const check = validateOutgoingMessage(
  { kind: 'text', to: '5511999999999', body: 'Olá!' },
  DEFAULT_OUTGOING_LIMITS,
);
if (!check.ok) {
  console.error(check.issues);
} else {
  await client.sendOutgoing('minha-sessao', check.value);
}

await client.sendOutgoing('minha-sessao', {
  kind: 'image',
  to: '5511999999999',
  data: imageBuffer,
  caption: 'Legenda',
});

const result = await client.trySendOutgoing('minha-sessao', {
  kind: 'document',
  to: '5511999999999',
  data: pdfBuffer,
  filename: 'proposta.pdf',
  mimetype: 'application/pdf',
});
if (!result.ok) {
  if ('issues' in result && result.issues) {
    // validação
  } else if ('error' in result) {
    // rede / sessão / WhatsAppSDKError
  }
}
```

## API legada

Os métodos `sendText`, `sendTextWithTyping`, `sendImage`, `sendAudio`, `sendVideo`, `sendDocument` permanecem estáveis e são usados internamente pela rota unificada. Use-os quando já tiver `Buffer` e parâmetros explícitos sem passar pelo objeto `kind`.
