# Visão geral do `@yaguar/whatsapp-sdk`

## O que este pacote faz

- Conecta ao **WhatsApp Web** via [Baileys](https://github.com/WhiskeySockets/Baileys) (`@whiskeysockets/baileys`).
- Gerencia **múltiplas sessões** por `sessionId` (QR, reconexão, estado de conexão).
- **Envia** texto, imagem, áudio, vídeo e documento; **recebe** mensagens via callbacks e eventos.
- Expõe um **event bus** in-process para o host integrar SSE, WebSocket ou filas.

## O que este pacote não faz

- **Não** inclui servidor HTTP (Express, Fastify, etc.).
- **Não** inclui banco de dados, ORM ou multi-tenant — você implementa `AuthStateProvider` e persistência no host.
- **Não** implementa regras de CRM (leads, campanhas, agendamento de negócio, notificações push do seu app).
- **Não** usa a **WhatsApp Cloud API** da Meta (Graph); é o protocolo **WhatsApp Web** (sessão no celular / QR).

## Fluxo típico

1. Criar `AuthStateProvider` (ex.: memória para testes, Mongo/Redis em produção).
2. Instanciar `WhatsAppClient` com `authProvider` e, opcionalmente, `onMessage` / `onMedia`.
3. `await client.connect(sessionId)` e escutar eventos `qr` até `connection: open`.
4. Enviar mensagens com a API **legada** (`sendText`, …) ou **unificada** (`sendOutgoing` / `trySendOutgoing`).
5. No shutdown do processo: `disconnect` / `shutdownAll`.

## Documentação relacionada

- [Contrato de mensagens (`sendOutgoing`)](./messaging.md)
- [Códigos de erro](./errors.md)
- [Integração no host (Yaguar / CRM)](./integration.md)
