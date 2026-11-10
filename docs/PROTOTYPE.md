# Protótipo jogável 0.1

## Decisões reversíveis

- Node.js com HTTP nativo, JavaScript e CSS sem framework; nenhuma dependência em runtime.
- 3–4 jogadores, três turnos, 15 suspeitos: `15 > 4 × 3`.
- Cinco perguntas por entrevista. No protótipo elas avançam depoimentos fixos; não são interpretadas por IA.
- Uma sessão em memória no servidor. Código de sala não concede acesso a conversas; token opaco identifica cada jogador.
- Polling a cada 1,5 segundos em vez de infraestrutura de tempo real antes de validar o fluxo.
- Notas compartilhadas explicitamente; histórico de entrevistas privado. Cada acusação fica oculta até o resultado coletivo.
- Identificador de ação evita duplicação de pedidos. O cliente repete a mesma ação se perder a resposta e conserva uma ação não confirmada até resolvê-la.
- Partidas sem persistência expiram após 24 horas. Reiniciar o servidor apaga tudo.
- O host pode remover alguém que abandonou. Após 60 segundos sem atividade autenticada do host, outro jogador pode assumir. Uma aba aberta que continua consultando a sala mantém a atividade; não há detecção de atenção humana.
- Remover/sair exclui o jogador dos próximos limites e do resultado. Essa regra precisa ser validada com o grupo antes da produção.

## Estrutura

`src/case.mjs` contém os fatos e a solução privada do caso. `src/engine.mjs` valida todas as transições e produz uma visão filtrada para cada jogador. `server.mjs` fornece API e apenas arquivos de `public/`. O cliente nunca recebe a solução antes da revelação. Como o repositório é público, alguém que deliberadamente lê o código pode descobrir a solução fixa; isso não equivale a proteção contra trapaça por leitura do repositório.

Endpoints: `POST /api/rooms`, `POST /api/rooms/:code/join`, `GET /api/rooms/:code`, `POST /api/rooms/:code/actions`. Os dois últimos exigem `Authorization: Bearer <token>`. Tokens nunca devem ser colocados em URLs, logs ou no Git.

## Ainda não entregue

- IA ao vivo, provedor ou cobranças. Nenhuma chave necessária para este protótipo.
- Arte final, retratos, áudio ou animações. Silhuetas e trem são CSS original; os conceitos do briefing não foram incluídos como assets de produção.
- Mistério balanceado e testado por grupos independentes. Os depoimentos são um fixture de mecânicas com pistas redundantes, não uma campanha final.
- Hospedagem pública, TLS, contas, persistência, moderação, observabilidade e política de dados.
- Reconexão entre aparelhos ou recuperação depois de apagar/fechar a sessão do navegador.
- Outros quatro casos, PWA, aplicativo nativo, integração itch.io ou submissão.

## Próximos incrementos recomendados

1. Rodar sessões com 3 e 4 pessoas, registrar duração, pistas ignoradas e se o resultado parece justo. Reescrever álibis, motivos e pistas com base nisso.
2. Escolher contrato de entrevistas antes do provedor: fatos permitidos, respostas indevidas, orçamento e fallback. Testar um adaptador simulado antes de habilitar chamadas pagas.
3. Acrescentar persistência e recuperação segura se o fluxo for aprovado. Só então preparar uma implantação de teste autenticada.
4. Produzir identidade visual e assets revisados, com licença e atribuições claras, preservando navegação e foco mobile.
