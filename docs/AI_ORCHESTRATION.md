# Orquestração de IA: ativação opcional e consentida

O runtime HTTP/Lambda é canônico por padrão. O template mantém EnableAi=false. ProvisionAiWorkers descreve as funções; o interruptor separado EnableAi ativa conjuntamente produtor, runtimes e gatilhos após aprovação operacional. Mesmo habilitado, só a pergunta com aiConsent=true admite um job. A integração opcional é exercitada por testes com provedor falso e armazenamento em memória; o adaptador DynamoDB tem testes de contrato, não testes na AWS real.

## Pergunta e orçamento

A pergunta produz evidência canônica imediatamente. Quando um repositório AiJobs está habilitado explicitamente e a pergunta tem consentimento booleano true, a mesma transação grava pergunta, recibo idempotente, job, outbox e três reservas: sala, dia UTC e mês UTC. Concorrentes disputam as versões dos contadores; orçamento insuficiente mantém a resposta canônica sem criar job. Cada contador recebe uma guarda de inicialização na mesma transação: se um contador já usado desaparecer, a guarda impede recriar o saldo como zero. Antes de iniciar, as três reservas e guardas são verificadas e suas versões condicionam a mudança de estado. Falha na leitura do orçamento também desativa a narração daquela pergunta.

Os valores atuais são propostas, não autorização de gasto: US$0,25/sala, US$5/dia, US$25/mês, até duas chamadas locais em execução. A reserva considera 2.500 tokens de entrada e 350 de saída, em microdólares inteiros. Modelo e tarifas ficam fixados no job; um provedor com outro modelo é recusado antes da chamada.

O saldo representa uso liquidado mais reservas ainda não liberadas. Conclusão com uso conhecido devolve a diferença. Expiração anterior ao marcador de início devolve toda a reserva. Resultado incerto depois do início mantém a reserva inteira, mesmo que o jogador receba apenas o texto canônico. Isso evita gastar novamente um valor que o provedor pode ter consumido.

Os limites cobrem somente chamadas feitas por esta aplicação. Não são teto garantido de fatura AWS/OpenAI e não incluem uso da credencial fora dela. Configuração de limite no projeto do provedor é uma segunda camada, sujeita às condições do serviço.

## Ciclo do job

- pending: orçamento e outbox confirmados na transação da pergunta.
- leased: posse por cinco segundos, com identificador exclusivo. Uma posse vencida pode ser substituída antes do início.
- provider_started: marcador persistido antes da chamada. Não é permitido tomar posse novamente e repetir a chamada.
- complete: narração curta e uso conhecido confirmados junto do ajuste dos três contadores.
- fallback: permanece a evidência canônica. A reserva é devolvida somente quando se sabe que a chamada não começou.

O prazo para acrescentar narração é 30 segundos. Ele é revalidado depois das esperas no banco e novamente após a obtenção da credencial, imediatamente antes do HTTP. Uma preparação interrompida depois do marcador pode conservar a reserva mesmo sem chamada HTTP, por segurança. O commit verifica versão do job, posse, caso, sala, rodada e entrevista ainda aberta. Resultado tardio não reabre entrevista, altera voto, muda resposta ou acrescenta texto depois do avanço de rodada. A reserva pode permanecer conservadoramente retida mesmo quando um resultado tardio traz uso conhecido.

O registro global de slots impede mais de duas admissões locais simultâneas. Em resultado incerto, o slot fica retido por uma janela de 60 segundos. Não há como provar que um processamento remoto terminou apenas porque a conexão local falhou; isso não é uma garantia de concorrência interna do provedor.

## Outbox, entrega e recuperação

A fila transporta apenas jobId. Pergunta, persona, evidência e sessão não vão na mensagem. O relay reconhece somente chaves de outbox; o stream declarado usa KEYS_ONLY.

O marcador sent é gravado depois da confirmação de envio. Uma confirmação perdida pode gerar nova entrega da mesma ID. O consumidor verifica o estado persistido e não repete uma chamada marcada como iniciada. Duplicatas não consomem nova pergunta nem nova reserva.

O índice esparso AiDueIndex permite consultar pendências por prazo, com limite e cursor, sem scan da tabela. A reconciliação finaliza jobs vencidos mesmo sem navegador conectado e reprograma tentativas de envio que falharam. Uma falha individual de liquidação recebe adiamento de 60 segundos, sem liberar saldo desconhecido, e não interrompe os itens seguintes. O resultado informa failed, deferFailures e cursor para o futuro executor acompanhar erros e continuar páginas limitadas. O runtime de reconciliação percorre até quatro páginas de 25 registros por invocação, persiste cursor com controle de versão e interrompe o trabalho com uma margem de cinco segundos para tentar salvar o progresso. O prazo é conferido entre itens e operações; chamadas SDK recebem sinal de cancelamento. Só itens concluídos avançam o cursor, inclusive quando a interrupção ocorre dentro da página. Checkpoint disputado ou falha de rede pode exigir reprocessamento idempotente na próxima invocação. O template descreve um schedule de cinco minutos, desativado. A ativação depende de revisão operacional aprovada.

## Privacidade e limites de qualidade

Somente o dono da entrevista recebe narração. A interface escapa o texto e o identifica como gerado por IA, não como evidência. Compartilhar usa exclusivamente a evidência canônica. O contexto do provedor contém somente persona autorizada, pergunta e resposta canônica daquela pergunta, sem solução global ou transcrição de outro jogador.

Schema e limites de tamanho não provam consistência narrativa nem eliminam alucinação ou prompt injection. A interface avisa e pede autorização opcional por entrevista; não persiste essa autorização. É necessário avaliar o modelo antes da ativação. store:false não equivale a retenção zero.

## O que falta para ativar

1. Aprovar com o dono da credencial projeto, modelo/versionamento, tarifas, limites e política de dados.
2. Verificar o aviso/consentimento implementado para envio externo. Pedir codinomes e ausência de dados pessoais; ausência de consentimento mantém evidência canônica sem job, reserva ou chamada.
3. Validar em homologação os runtimes e políticas declarados. O worker usa ações condicionais DynamoDB, incluindo ConditionCheckItem; relay lê/escreve somente outbox e recebe chaves do stream; reconciliador usa o índice e os registros necessários à liquidação. Somente o worker pode receber permissão condicional para o ARN GPT exato. Nenhuma dessas permissões foi aplicada. Configurar alarmes e revisar ativação separadamente.
4. Testes reais DynamoDB/SQS/Lambda, capacidade regional, recuperação e avaliação narrativa.
5. Configuração segura da credencial e teste pago limitado, com autorização específica.

Não há chave, criação de segredo, aumento de quota, deploy ou chamada real de IA neste desenvolvimento.

## Runtimes e permissões declaradas

Cada função tem pacote, papel de execução e grupo de logs próprios. Worker, relay e reconciliador checam seu flag antes de criar qualquer dependência. Worker exige política completa e ARN explícito, valida a origem SQS e busca a credencial somente ao preparar uma chamada admitida. Uma política de modelo/preço diferente da gravada no job provoca fallback antes da leitura da credencial.

Relay e reconciliador não exigem configuração de modelo nem de segredo. Usam modo de manutenção que não pode admitir perguntas ou iniciar o provedor. Relay apenas envia/acknowledga o outbox; se ele vencer, fecha o outbox e deixa a liquidação financeira para o reconciliador. Portanto, um atraso na recuperação pode manter reserva por mais tempo.

IAM é delimitado por tabela/índice/stream/fila e prefixos das partições. Os papéis novos não têm acesso ao bucket do caso, sessões ou credencial de origem. O worker pode receber GetSecretValue somente no ARN configurado; ARN vazio não concede essa permissão e uma regra do template recusa o mesmo ARN para GPT e origem da API. Segredo com chave KMS própria exigirá revisão específica, sem concessão genérica de decrypt.

Os runtimes não imprimem eventos, prompts, conteúdo de segredo ou mensagens originais de erros. Falhas de inicialização são genéricas e uma invocação posterior pode tentar inicializar novamente. Isso não equivale a observabilidade completa: alarmes, métricas operacionais e resposta à DLQ precisam ser combinados antes da ativação.

A API recebe somente a política de preços/limites. Somente o worker tem acesso condicional ao segredo OpenAI exato. Um retry preserva o consentimento e a identidade originais da pergunta; mudar o corpo com a mesma ID é conflito. A capacidade pública ai_optional não informa chave, ARN, projeto, política ou modelo.
