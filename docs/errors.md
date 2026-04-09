# Erros e códigos

Todos os erros específicos do pacote estendem `WhatsAppSDKError` (exceto erros genéricos do Node/Baileys não mapeados).

Use `isWhatsAppSDKError(err)` para narrowing.

## Erros de classe (`WhatsAppSDKError` e subclasses)

| Classe | `code` | Quando ocorre |
|--------|--------|----------------|
| `WhatsAppSDKError` | (variável) | Base. |
| `InvalidJidError` | `INVALID_JID` | `normalizeWhatsAppJid` / `to` inválido ao enviar. |
| `SessionNotConnectedError` | `WA_NOT_CONNECTED` | Envio com socket ausente ou conexão ≠ `open`. |
| `SessionLimitError` | `MAX_SESSIONS` | `connect` excede `maxSessions`. |
| `SendIncompleteError` | `WA_SEND_INCOMPLETE` | Resposta do envio sem `key.id`. |
| `OutgoingValidationError` | `INVALID_OUTGOING` | `sendOutgoing` com payload que falhou na validação; `issues` em `error.details` e `error.issues`. |

## Issues de validação (`OutgoingIssue`)

Quando `validateOutgoingMessage` retorna `{ ok: false, issues }` ou `OutgoingValidationError` é lançado, cada item tem:

- `path` — campo (ex.: `body`, `data`, `to`, `kind`).
- `code` — estável (ex.: `REQUIRED`, `INVALID_KIND`, `TEXT_TOO_LONG`, `MEDIA_TOO_LARGE`, `INVALID_JID`).
- `message` — texto legível (português no validador atual).

## Mapeamento sugerido para HTTP (host)

O SDK **não** conhece HTTP. Sugestão para APIs REST do CRM:

| Situação | HTTP |
|----------|------|
| `OutgoingValidationError` / issues de validação | `422 Unprocessable Entity` + corpo com `issues`. |
| `SessionNotConnectedError` | `409 Conflict` ou `503 Service Unavailable` (conforme política do produto). |
| `SessionLimitError` | `429 Too Many Requests` ou `503`. |
| `InvalidJidError` | `400 Bad Request`. |
| `SendIncompleteError` | `502 Bad Gateway` ou `500` (falha downstream opaca). |
| Erro desconhecido (Baileys/rede) | `502` / `500` + log estruturado. |

## `trySendOutgoing`

Não lança em validação nem em `WhatsAppSDKError`:

- `{ ok: false, issues }` — payload inválido.
- `{ ok: false, error }` — falha de envio; `error` pode ser `WhatsAppSDKError` (use `isWhatsAppSDKError`) ou `Error` genérico.
