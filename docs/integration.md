# Integração no host (ex.: backend Yaguar)

O SDK foi desenhado para rodar **dentro** do seu processo Node (API, worker, desktop). O host é responsável por:

1. **Persistência de credenciais Baileys** — implementar `AuthStateProvider`:
   - `loadState(sessionId)` → `{ state, saveCreds }` compatível com Baileys.
   - `clearState(sessionId)` opcional para logout local.

   No produto Yaguar, isso costuma ser Mongo (equivalente conceitual a `useMongoAuthState`); o código fica no repositório do backend, não no pacote npm.

2. **HTTP / autenticação / multi-tenant** — rotas REST, cabeçalhos `X-Tenant-Id`, conexão Mongo por tenant, etc. ficam **fora** do SDK.

3. **Tempo real** — `client.getEventBus()` ou `client.on(sessionId, handler)` alimentam SSE, WebSocket ou fila para o front.

4. **Ingestão de CRM** — use `onMessage` / `onMedia` para gravar conversas, ou `skipBuiltinMessagePipeline` + `onSocketReady` para ler `WAMessage` bruto e persistir no seu schema.

5. **Envio** — pode chamar `sendOutgoing` a partir de casos de uso (campanhas, agendamento) mantendo **regras de negócio no host**; o SDK só valida formato/limites e fala com o socket.

## Dependência entre repositórios

O backend pode declarar `"@yaguar/whatsapp-sdk": "file:../yaguarzap-whatsapp-sdk"` ou versão publicada no registry interno. Após atualizar o SDK, rode `npm run build` no pacote e reinstale no consumidor.

## Testes

No pacote do SDK: `npm test` (validação e `trySendOutgoing` sem WhatsApp real). Testes E2E com sessão real permanecem no host ou em ambiente dedicado.
