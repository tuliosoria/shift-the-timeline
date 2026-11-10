# Estado da implementação

## Primeiro corte: backend canônico durável

- [x] Isolar o caso editorial e usar fixture sintética pública.
- [x] Regras autoritativas e projeções privadas.
- [x] Transações, controle de versão e idempotência entre instâncias.
- [x] Sessões por cookie, expiração, renovação explícita e logout.
- [x] Cliente com convite de oito caracteres, retomada e polling adaptado.
- [x] Adaptadores HTTP local e Lambda.
- [x] Limites duráveis e verificação de origem.
- [x] Template SAM/CloudFormation sem deploy ou alteração de quota.
- [x] Empacotamento novo, imutável e com manifesto completo.
- [x] Revisão independente de código e correções testadas.
- [x] CI remoto e validação estática do CloudFormation com cfn-lint.
- [ ] Testes reais DynamoDB/Lambda e QA de navegador.
- [ ] Deploy de homologação, teste de capacidade e rollback.

## Integração GPT posterior

- [x] Contratos locais de orçamento, provedor restrito e worker, com provedor falso.
- [x] Reserva de orçamento e job/outbox na mesma transação de pergunta, com integração opcional testada.
- [x] Leases/fencing, relay e reconciliação persistentes em código, com dependências injetadas.
- [x] Índice de pendências, stream somente de chaves e filas/DLQ opcionais no template.
- [ ] Runtime worker/relay/reconciliador implantável, políticas IAM e gatilhos revisados e desativados por padrão.
- [x] Testes simulados de concorrência de orçamento, mudança de período, entrega duplicada e resultado incerto.
- [x] Projeção privada e renderização da narração opcional separada da evidência canônica.
- [ ] QA de navegador e aviso/consentimento de dados antes de ativar envio externo.
- [ ] Projeto/modelo, preço e política de dados aprovados pelo dono da credencial.
- [ ] Configuração segura e teste pago limitado, autorizado separadamente.

## Antes do público

- [ ] Política de abandono sem voto inventado e experiência de logout/recuperação.
- [ ] Capacidade regional verificada; nenhum aumento automático.
- [ ] Licenças, retenção, alertas, custos, DNS/TLS e permissões revisados.
- [ ] Playtests com 3 e 4 pessoas e avaliação de consistência narrativa.
