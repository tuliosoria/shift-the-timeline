# Validação deste corte

## Executado localmente

- 86 testes Node aprovados após as duas revisões independentes.
- Sintaxe dos módulos verificada.
- Bundle Lambda importado com sucesso; manifesto verifica todos os seis arquivos e inclui avisos de dependências.
- Auditoria npm completa sem vulnerabilidades nesta verificação.
- Caso editorial mantido fora do Git; fixtures públicas sintéticas.
- Provedor GPT falso: nenhuma chamada paga, chave real ou mudança AWS.

A revisão encontrou e os testes reproduziram antes das correções:

1. Resíduos/bytes antigos em rebuild do pacote. Build novo e manifesto completo substituem a reutilização.
2. Entrada ou comando idêntico cujo concorrente confirma entre a leitura do recibo e a da sala. O recibo é conferido antes de devolver conflito semântico.
3. Sessão antiga expirando durante sala recém-criada. Bootstrap/admissão explícita renovam sessão ainda válida; leituras não renovam e logout não é revertido.

## Revisão da orquestração durável

A segunda revisão encontrou três falhas reproduzidas antes da correção:

1. Perda de contador permitia recriar saldo, e um orçamento corrompido só falhava depois da chamada. Guardas persistidas impedem reinicialização indevida; reservas e guardas condicionam o início atomicamente.
2. Esperas no banco ou preparação do provedor podiam ultrapassar o prazo antes de começar HTTP. O deadline acompanha o fluxo e é revalidado imediatamente antes do envio.
3. Um job com orçamento inválido interrompia toda a reconciliação. Falhas individuais são adiadas sem liberar saldo desconhecido, enquanto os demais itens continuam.

Todos os cenários usam dados sintéticos e provedor falso. Não houve obtenção de uma credencial real.

## CI remoto

O [workflow de verificação](https://github.com/tuliosoria/shift-the-timeline/actions/runs/42755461694) do primeiro corte passou com Node.js 22: instalação limpa, 52 testes, sintaxe, auditoria, pacote e validação estática cfn-lint 1.60.0. A primeira execução apontou uma dependência CloudFormation redundante, removida antes desta execução verde.

O segundo corte deve passar novamente no CI do commit publicado. A validação estática não executa um change set nem prova o comportamento da stack na AWS.

## Ainda não comprovado
- Integração real DynamoDB, Lambda, Secrets Manager, CloudFront, WAF e DNS/TLS.
- QA de navegador do cliente atualizado, celular e acessibilidade.
- Load test, custos reais, backup/restore e rollback.
- Runtime/integração operacional de GPT, qualidade narrativa e resistência semântica a instruções do jogador.
- Playtest do caso editorial.

Nenhuma dessas verificações pendentes é coberta por testes de contrato com cliente AWS simulado.
