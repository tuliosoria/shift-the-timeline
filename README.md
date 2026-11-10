# SHIFT: The Timeline

Jogo cooperativo de investigação em português para 3–4 pessoas. Um crime é previsto; a equipe divide entrevistas privadas, compartilha pistas e faz acusações individuais.

## Estado deste desenvolvimento

Este corte implementa o backend canônico, sessões por cookie, armazenamento transacional DynamoDB e infraestrutura AWS declarativa. **Não houve deploy. A IA GPT não está conectada.** O caso editorial e sua solução não são publicados neste repositório.

- Regras autoritativas: 15 suspeitos, 3 turnos, até 4 perguntas por entrevista.
- Convite de oito caracteres; uma identidade por navegador e sala.
- Entrevistas privadas; quadro por compartilhamento explícito; votos privados até a revelação.
- Persistência entre instâncias e reenvio idempotente de comandos.
- Expiração após 6 horas sem ações ou 24 horas desde a criação. Polling não renova o prazo.
- Jobs, outbox e orçamento transacional de IA testados com provedor falso, por injeção explícita. O runtime publicado continua canônico: não instancia essa integração nem chama GPT.

Os números de turnos e perguntas continuam provisórios até playtest.

## Desenvolvimento local

Requer Node.js 22+.

```sh
npm ci
SHIFT_CASE_FILE=tests/fixtures/case.mjs npm start
```

Abra http://127.0.0.1:3000. Esse comando usa um **caso sintético técnico**, não um mistério pronto para jogar. Use três contextos/perfis de navegador separados para representar três pessoas. Abas do mesmo navegador compartilham identidade.

Para usar um caso editorial autorizado, configure `SHIFT_CASE_FILE` apontando para um arquivo privado que exporte `TRAIN_CASE` e `CASES`. A pasta `private/` é ignorada pelo Git. Não coloque roteiros privados no código do navegador.

Sem `SHIFT_TABLE`, o modo local usa memória e perde salas no reinício. Produção recusa memória: exige DynamoDB, origem HTTPS, verificação de origem e artefato privado do caso com SHA-256 fixado.

## Verificações

```sh
npm test
npm run check
npm audit
npm run package
```

O pacote é criado do zero e contém somente assets públicos, bundle Lambda e avisos de terceiros. Saídas anteriores ficam em `dist.previous-*`, fora do diretório a publicar. Nunca publique essas pastas.

Testes locais não substituem integração com DynamoDB/Lambda reais, DNS/TLS, QA de navegador ou playtest.

## Estrutura

- `server/game.mjs`: regras de jogo e projeções privadas.
- `server/persistent-game.mjs`: transações e idempotência.
- `server/storage/`: adaptadores de memória e DynamoDB.
- `server/api.mjs`, `server/sessions.mjs`: HTTP, origem, cookies e autorização.
- `server/ai/`: jobs/orçamento/entrega duráveis e provedor restrito, não ativados no runtime.
- `public/`: cliente do navegador, sem solução do caso.
- `infra/template.json`: SAM/CloudFormation, sem aplicação automática.
- `tests/fixtures/`: conteúdo sintético público.

Veja [design](docs/BACKEND_DESIGN.md), [estado da implementação](docs/IMPLEMENTATION_PLAN.md), [implantação](docs/DEPLOYMENT.md), [validação](docs/VALIDATION.md), [orquestração de IA](docs/AI_ORCHESTRATION.md), [créditos](AI_AND_CREDITS.md) e [licenças](LICENSE_STATUS.md).
