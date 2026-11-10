# Backend SHIFT

## Arquitetura

Cliente HTML/CSS/JS em S3 privado, servido por CloudFront. API Gateway HTTP encaminha comandos a Lambda Node.js. DynamoDB é a fonte de estado, sessão e idempotência. Cada produto/ambiente tem seus próprios recursos; o site principal não recebe alterações deste stack.

A escolha preserva o protótipo sem administrar servidor permanente. Polling autenticado é suficiente para o jogo por turnos: intervalo de 2,5 segundos com jitter e 15 segundos em aba oculta. Respostas atrasadas não podem regredir a versão do estado.

A cota regional Lambda é compartilhada com outros aplicativos. Este código não cria reservas nem solicita aumento. A capacidade do beta precisa ser medida e aprovada antes de abrir novas salas; lançamento público irrestrito não faz parte deste corte.

## Regras e isolamento

Servidor controla fase, rodada, entrevistado, limites, compartilhamento e resultado. Um grupo tem 3–4 jogadores e 15 suspeitos; três turnos e quatro perguntas por entrevista. Somente o próprio jogador vê sua transcrição e acusação antes do desfecho. O quadro é compartilhado por ação explícita. Nenhum timeout inventa voto.

O caso de produção é um artefato privado versionado. Não basta ocultar a solução no bundle se o roteiro com o culpado estiver no GitHub. O runtime público recebe schemas, carregamento e dados sintéticos; o pacote real fica fora do repositório. Uma sala fixa a versão do caso. A publicação de uma versão nova deve manter a anterior disponível até o fim das salas ou esperar a expiração delas; o carregador atual aceita uma versão por processo e recusa salas incompatíveis.

## Persistência e concorrência

O estado é dividido em metadados da sala e um item por jogador, cada item limitado a 128 KB. Esse formato suporta os limites atuais sem aproximar um único agregado do teto de item DynamoDB. Aumentar perguntas/participantes exige revisar particionamento.

Cada mutação grava os itens, a condição de versão e o recibo de idempotência na mesma transação. Recibos são escopados por sessão/operação e duram até o prazo absoluto da sala. Mesmo ID com dados diferentes retorna conflito. Leitura transacional e verificação de versão impedem snapshots que misturem rodadas.

Salas expiram após seis horas sem ações ou 24 horas absolutas. O aplicativo bloqueia acesso imediatamente; TTL físico pode demorar. Polling não renova. A política de backups e sua retenção exige revisão antes do lançamento.

## Sessão e segurança

Cookie de produção `__Host-shift_session`, Secure, HttpOnly, SameSite=Strict, Path=/ e sem Domain. Somente seu hash é persistido. Convite da sala não é identidade do jogador. Bootstrap e entrada/criação explícita renovam uma sessão ainda válida para cobrir a nova sala, com margem operacional de um minuto. GETs não renovam. Logout e expiração não são revertidos por essa renovação.

A API exige Origin exata em POST, limita JSON a 8 KiB e aplica limites duráveis de uso. IP vem do transporte ou de header gerado pelo CloudFront depois de verificar a origem, nunca de `X-Forwarded-For` arbitrário. Requisições podem consumir o limite de tentativas mesmo quando repetidas; isso limita abuso, mas pode atrasar retries em redes instáveis.

CloudFront não armazena respostas da API nem erros personalizados. Um segredo exclusivo de origem é configurado separadamente por fluxo autorizado. A função recebe seu ARN, não a chave GPT. A API não tem permissão para a credencial OpenAI. Nenhum segredo é criado pelo repositório/CI.

O guard bloqueia ações pela origem direta, mas a requisição ainda pode alcançar API Gateway/Lambda e gerar cobrança. Throttling, WAF e limites do aplicativo não são teto garantido da fatura.

## IA planejada

A verdade e a evidência são canônicas. GPT poderá acrescentar voz ao suspeito, com entrada limitada à sua persona, pergunta e fatos autorizados. Sem solução global, votos alheios, ferramentas, web ou URLs escolhidas pelo jogador. O texto canônico permanece inalterado. Schema válido não prova ausência de alucinação; avaliações e playtest continuam necessários.

Os módulos atuais de orçamento/provedor/worker estão desconectados da aplicação. Ainda faltam reserva transacional por sala/dia/mês, outbox, fila, leases/fencing persistentes, reconciliação e integração visual. Nenhuma variável de ambiente deste corte ativa chamadas GPT no jogo.

A integração futura exige projeto/modelo aprovado pelo dono da credencial, chave restrita em armazenamento seguro e limites de custo. Modelo não será escolhido pelo browser. Não se promete retenção zero: configuração `store:false` não elimina necessariamente logs de abuso do provedor.

## Entrega e rollback

Infraestrutura como código separa API, banco, buckets privados, certificado, CDN, WAF e DNS. Criar recursos, publicar o domínio, configurar IAM ou segredos são passos operacionais posteriores, com change set revisado. O parâmetro de novas salas começa desligado.

Pacotes usam diretórios novos e manifesto completo. Saídas antigas nunca são reutilizadas. O rollback deve manter a mesma versão do caso e schema compatível, preservar tabelas e não apagar conversas. A primeira homologação deve demonstrar restauração, atualizações concorrentes e retorno à versão anterior antes do público.
