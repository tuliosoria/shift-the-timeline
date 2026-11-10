# Implantação AWS e ativação controlada

O template usa SAM/CloudFormation em `us-east-1`. Não há workflow de deploy, credencial AWS, chave GPT ou geração de segredos neste repositório. CI só testa, audita e empacota.

## Pré-requisitos e gates

1. Revisar a conta/região e a cota Lambda atual. Não aplicar reservas nem solicitar aumento por este template.
2. Confirmar autorização para recursos, custo, IAM, DNS e certificado do nome escolhido. O domínio de homologação, se diferente de `shift.terminalufo.com`, também precisa ser aprovado.
3. Revisar o change set e as políticas exatas. O papel de execução não deve herdar acesso administrativo.
4. Configurar separadamente um segredo de origem com JSON `token`, contendo 64 caracteres hexadecimais aleatórios. Ele protege a origem HTTP; **não é a chave OpenAI**. Não enviar valor em chat, Git, terminal com histórico ou log. O template recebe apenas ARN e faz referência dinâmica ao Secrets Manager.
5. Preparar um artefato JSON privado `{caseData,catalog}`, com versão fixa e hash SHA-256. Não enviar esse arquivo ao repositório ou ao bucket de assets.
6. Definir políticas de dados, custos e alertas. O template não configura orçamento/alertas de cobrança.

## Build e validação

```sh
npm ci
npm test
npm run check
npm audit
npm run package
cfn-lint infra/template.json
```

A versão de cfn-lint usada no CI é 1.60.0. O diretório publicável é somente `dist/web`. Os artefatos Lambda são `dist/api`, `dist/worker`, `dist/relay` e `dist/reconciler`, cada qual para a função correspondente. Compare todos os arquivos com `dist/manifest.json`. Não publique `dist.previous-*`, pasta privada, testes ou diretório de trabalho.

`ReleaseId` deve identificar o commit/release verificado. Assets vão para `releases/<ReleaseId>/` no bucket de assets. O caso JSON vai para a chave privada indicada por `CaseKey` no bucket de casos; comparar seu hash com `CaseSha256` antes de habilitar novas salas.

## Ordem operacional, após aprovação

- Validar parâmetros e gerar change set, sem executá-lo automaticamente.
- Aplicar stack com `AllowNewRooms=false`. O banco/buckets usam retenção e proteção contra exclusão; remover stack não significa apagar seus dados.
- Publicar somente os pacotes verificados e o caso privado no destino correto.
- Esperar certificado, distribuição e DNS ficarem prontos; verificar delegação DNS externa, HTTPS e headers reais.
- Habilitar novas salas somente para a homologação combinada e medir contenção/custos.
- Rodar partida completa com 3 e 4 contextos reais, privacidade, erro/retry, reinício, expiração e rollback.

O índice AiDueIndex e o stream KEYS_ONLY suportam os jobs privados de IA. ProvisionAiQueue e ProvisionAiWorkers começam false; workers exigem filas. EnableAi começa false e controla conjuntamente produtor, três runtimes, mapeamentos e schedule. Provisionar recursos não ativa chamadas. A regra de configuração exige filas, workers, ARN de credencial e política quando EnableAi=true. AiSecretArn começa vazio e não concede leitura GPT; preencher um ARN em um change set futuro concede acesso somente ao papel do worker e exige autorização específica. AiPolicyJson é configuração de modelo/tarifas/limites, nunca uma chave.

A API só produz jobs com EnableAi=true e aiConsent=true na pergunta específica. /api/cases expõe dialogueMode=ai_optional quando a opção está habilitada; ausência/false/valores não booleanos não admitem jobs. A interface mantém o consentimento desmarcado a cada entrevista/recarregamento, informa o envio à OpenAI e permite jogar de forma canônica. Complete a aprovação do dono da credencial e a homologação antes de ativar. Não há passo automático que aplique IAM ou habilite execução.

Não existe uma implantação validada nem URL jogável prometida por este PR. O template pode precisar de ajustes depois da validação real. O GPT permanece desligado por padrão; uma configuração declarada não comprova implantação nem autorização de gasto.

## Rollback

Pause novas salas. Retorne código e assets à versão anterior compatível por change set revisado. Preserve DynamoDB e segredos. O template inicial ainda não configura alias Lambda/canary automático; rollback é atualização de stack com o pacote anterior, a testar em homologação.

Não troque o caso de salas existentes. O runtime aceita uma versão de caso por processo e retorna indisponibilidade quando a sala tem outra versão; aguarde expiração das salas antes da troca, ou implemente carregador multiversão antes de fazer atualização sem interrupção.

Restauração de backup precisa ser testada em tabela separada. Não reativar sessões revogadas ou dados expirados. Exclusão definitiva exige decisão explícita, não faz parte do rollback.

## Verificação dos runtimes desligados

O build produz os arquivos verificados no manifesto, distribuídos nos quatro pacotes de função e nos assets. Testes importam os handlers e verificam que worker/relay/reconciliador desligados não criam clientes nem acessam dados.

A visibilidade SQS proposta é 180 segundos para worker de 30 segundos, batch size 1 e MaximumConcurrency 2. Isso não reserva capacidade Lambda nem isola os outros projetos. O relay usa stream com filtro de inserções de outbox; falhas esgotadas vão à DLQ própria. O schedule permanece desligado enquanto EnableAi=false. Quando ativado explicitamente, executa a cada cinco minutos, sem retry automático do evento.

A política de leitura de streams segue o [exemplo oficial da AWS](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/iam-policy-example-lamda-process-dynamodb-streams.html), limitado aos streams da tabela SHIFT. Os contratos IAM ainda precisam ser exercitados na AWS real antes de afirmar que a implantação funciona.

## Checklist de lançamento

1. Verificar o commit e CI, conta/região, cota e ausência de conflito DNS. Inspecionar apenas metadados de credenciais, sem imprimir valores ou ambientes Lambda.
2. Aprovar os recursos e gastos, segredo de origem separado, alvo exato do segredo OpenAI e acesso restrito do worker. A credencial deve entrar por um canal seguro; nunca em chat, Git, parâmetros CloudFormation ou comandos com valores.
3. Empacotar cada função com seu diretório, publicar somente dist/web no bucket de assets e o JSON privado no bucket de casos. Ambos devem coincidir com hashes locais.
4. Criar/revisar change set com AllowNewRooms=false e EnableAi=false. Conferir IAM, recursos substituídos e DNS antes de executar.
5. Verificar HTTPS, headers, saúde e rejeição de acesso direto à origem. Testar armazenamento real e jogo completo com três/quatro sessões independentes. Não registrar corpos privados.
6. Aprovar modelo e tarifas verificadas. Para gpt-6-luna, o provedor fixa reasoning.effort=none e service_tier=default. A política deve reservar entrada com tarifa conservadora que cubra eventual cache write; não contar descontos esperados.
7. Só então aplicar EnableAi=true, verificar um teste pago limitado e manter fallback canônico se o provedor falhar. Verificar opt-out, privacidade, repetição, DLQ, reconciliação e orçamento.
8. Liberar novas salas e confirmar a URL. Os alarmes declarados ficam no console AWS, sem destinatários externos e sem promessa de monitoramento automático.

Há alarmes para erros/throttles da API, erros de worker/relay e as duas filas de falha. Eles não são limite de fatura. Não há orçamento AWS automático nem desligamento financeiro garantido. O limite de chamadas da aplicação também não cobre uso externo da mesma chave.

Fontes de preço/modelo para revisão operacional: https://developers.openai.com/api/docs/models/gpt-6-luna e https://developers.openai.com/api/docs/pricing. Não migrar modelo ou mudar tarifas silenciosamente.

O [escopo aprovado](APPROVED_DEPLOYMENT.md) registra destino, modelo, limites, estimativa AWS e separação de credenciais para o primeiro lançamento. Isso não substitui a verificação dos recursos reais e do change set.
