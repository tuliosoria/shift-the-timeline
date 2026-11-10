# Implantação AWS: ainda não executada

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

O índice AiDueIndex e o stream KEYS_ONLY preparam o armazenamento para IA. ProvisionAiQueue e ProvisionAiWorkers começam false; workers exigem filas. Se provisionados futuramente, os três runtimes ainda terão flags false, mapeamentos Enabled=false e schedule DISABLED. AiSecretArn começa vazio e não concede leitura GPT; preencher um ARN em um change set futuro concede acesso somente ao papel do worker e exige autorização específica. AiPolicyJson é configuração de modelo/tarifas/limites, nunca uma chave.

A API continua canônica e não produz jobs. Não altere flags ou gatilhos para tentar ativar IA sem concluir aviso/consentimento, aprovação do dono da credencial, integração da admissão e homologação. Não há passo automático que aplique IAM ou habilite execução.

Não existe uma implantação validada nem URL jogável prometida por este PR. O template pode precisar de ajustes depois da validação real. O GPT permanece desconectado; não basta fornecer uma chave para habilitá-lo.

## Rollback

Pause novas salas. Retorne código e assets à versão anterior compatível por change set revisado. Preserve DynamoDB e segredos. O template inicial ainda não configura alias Lambda/canary automático; rollback é atualização de stack com o pacote anterior, a testar em homologação.

Não troque o caso de salas existentes. O runtime aceita uma versão de caso por processo e retorna indisponibilidade quando a sala tem outra versão; aguarde expiração das salas antes da troca, ou implemente carregador multiversão antes de fazer atualização sem interrupção.

Restauração de backup precisa ser testada em tabela separada. Não reativar sessões revogadas ou dados expirados. Exclusão definitiva exige decisão explícita, não faz parte do rollback.

## Verificação dos runtimes desligados

O build produz 15 arquivos verificados no manifesto, distribuídos nos quatro pacotes de função e nos assets. Testes importam os handlers e verificam que worker/relay/reconciliador desligados não criam clientes nem acessam dados.

A visibilidade SQS proposta é 180 segundos para worker de 30 segundos, batch size 1 e MaximumConcurrency 2. Isso não reserva capacidade Lambda nem isola os outros projetos. O relay usa stream com filtro de inserções de outbox; falhas esgotadas vão à DLQ própria. O schedule permanece desligado e não faz retry automático.

A política de leitura de streams segue o [exemplo oficial da AWS](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/iam-policy-example-lamda-process-dynamodb-streams.html), limitado aos streams da tabela SHIFT. Os contratos IAM ainda precisam ser exercitados na AWS real antes de afirmar que a implantação funciona.
