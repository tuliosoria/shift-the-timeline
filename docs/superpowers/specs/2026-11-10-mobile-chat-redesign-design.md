# SHIFT: redesign mobile, chat com IA e deduções destraváveis

Data: 2026-11-10. Base: `main` em `b7ae45c`. Jogo no ar: https://shift-zndzouh3e74wy.azurewebsites.net/ (caso público Bracken Quay, `dialogueMode: optional-openai`).

## Intenção

O SHIFT é para ser jogado **numa mesa de churrasco com os amigos**: cada um no seu celular, comendo, bebendo, zoando, contando em voz alta o que descobriu. Hoje o jogo parece um formulário longo de site, com dropdowns, checkbox de consentimento, busca, correlações e hipóteses estruturadas. Isso mata o ritmo da mesa.

O jogo novo deve parecer **um app de celular**, mínimo e rápido. O clima é tenso: alguém VAI morrer em 24 horas. O jogador é um investigador de crimes futuros que precisa descobrir quem será o assassino e intimá-lo antes que aconteça. A investigação é **conversar com os suspeitos, que são interpretados por uma IA** que sabe quem é o assassino. As deduções **destravam sozinhas** durante as conversas, como conquistas.

Prazo externo: Game Off 2026 (`docs/GAME_OFF.md`), entrega até **1º de dezembro de 2026, 21h37 UTC**.

## Referência visual aprovada

O dono do projeto aprovou "exatamente como eu queria" o esboço em `~/shift-qa-synthetic/.superpowers/brainstorm/24057-1794359762/content/fluxo-interrogatorio.html`. São duas telas de celular:

1. **Escolher suspeito:** um título que diz a ação ("Who will you question?"), uma linha de apoio, uma grade de 2 colunas com retratos grandes (nome e papel sobre um degradê), a seleção marcada com contorno dourado e ✓, e o botão dourado fixo no rodapé com o nome escolhido ("Question Martha →"). Embaixo do botão, uma dica com o número de perguntas.
2. **Interrogatório como chat:** cabeçalho com avatar redondo, nome, papel e contador ("2 of 4 asked" com bolinhas; no jogo novo serão 3). As mensagens são balões: o suspeito à esquerda em marfim, o jogador à direita em vinho, e o mais recente embaixo. (O link "Share with team ↗" do esboço **sai**; ver Deduções.) Um indicador "• • •" aparece enquanto a IA responde. Há uma linha de chips de sugestão acima do campo, e o campo arredondado fica fixo embaixo com o botão de enviar redondo.

O conceito de arte em `~/Downloads/SHIFT-conceito-interface-mobile.png` dá o tom: art déco, azul-marinho, dourado e vinho, retratos grandes, botões dourados.

## Fluxo da partida

1. **Entrada e sala.** O host cria a sala, e os amigos entram pelo código ou pelo link de convite (já existe). Mínimo de 3 e máximo de 4 jogadores (mantido).
2. **Abertura.** Uma tela de instruções curta, em tom tenso, sobre vídeo de fundo: a previsão do crime, quem é você, o objetivo (descobrir e intimar o assassino) e as regras essenciais em poucas linhas (turnos, perguntas, deduções, intimação).
3. **4 turnos de 6 horas = 24 horas na história.** O relógio da história marca 20:00 → 02:00 → 08:00 → 14:00, e o crime acontece às 20:00 do dia seguinte. Os horários exatos são escolha do construtor desde que somem 24h em 4 turnos de 6h.
   - Em cada turno, **cada jogador escolhe um suspeito** (tela 1 do esboço) e conversa com ele (tela 2).
   - **3 perguntas por turno.** O contador do chat mostra "n of 3".
   - **Na 3ª resposta o turno do jogador termina sozinho.** O "End interview" / "Finish my round" deixa de existir.
   - Quem termina antes vê quem ainda está conversando ("Waiting for: Ana, Léo") e pode revisar as próprias deduções.
   - **Quando todos terminam, o turno vira para todos ao mesmo tempo**, com uma transição em vídeo do tipo "6 hours later… 02:00".
   - O host pode forçar a virada (alguém sumiu da mesa) com uma confirmação. Quem não terminou perde as perguntas restantes daquele turno.
   - Repetir um suspeito em outro turno é permitido (decisão do construtor; não foi discutido, mas o código atual permite revisitar).
4. **Intimação individual.** Depois do 4º turno, cada jogador intima, em particular, quem acha que será o assassino. A escolha é irreversível.
5. **Revelação.** Quando todos intimarem, vem a revelação com vídeo: quem era o assassino, quem acertou e a solução. O resultado completo/parcial/derrota que já existe se mantém.

## Interrogatório com IA

- **A IA sempre responde.** Não existe mais o checkbox de consentimento por pergunta nem o seletor de tópico. A pergunta é texto livre; os chips são só atalhos que preenchem e enviam.
- A IA **interpreta o suspeito em primeira pessoa**. Ela conhece a verdade do caso: quem é o culpado, o que cada suspeito sabe, o que esconde e onde mente. O assassino pode mentir; os inocentes também podem esconder coisas, mas nunca de um jeito que torne a solução impossível.
- **A IA não inventa fatos que contradigam o caso.** Os fatos vêm do caso escrito; a IA dá voz e escolhe o que revelar de acordo com a pergunta.
- **A conversa tem memória dentro da mesma entrevista.** O suspeito lembra o que já foi perguntado e respondido naquela conversa. O provedor atual não envia histórico; isso muda.
- A resposta é curta (1 a 3 frases, inglês britânico).
- **Quando a IA falha** (erro, tempo esgotado ou orçamento), o jogador recebe a resposta fixa existente do suspeito para o tópico inferido, e a pergunta conta normalmente. O jogo nunca trava esperando a IA. *(Decisão de Claude.)*
- **Privacidade:** um aviso de uma linha na criação e na entrada da sala diz que as perguntas vão para a IA e pede para não digitar dados pessoais. Esse aviso substitui o consentimento por pergunta. *(Decisão de Claude.)*

### Comportamento do chat (padrão de mensageiro)
- Enviar com o botão ou com Enter; Shift+Enter quebra a linha.
- Ao enviar: o balão do jogador aparece na hora, o campo limpa, **o foco continua no campo** e a lista rola até o fim. O "• • •" aparece até a resposta chegar. Depois da resposta, a lista rola de novo.
- O teclado do celular não pode cobrir o campo nem a última mensagem (usar `visualViewport` / `interactive-widget=resizes-content` ou equivalente; escolha do construtor).
- O rascunho não enviado sobrevive a recarregamento (já existe em `ui-state.js`).
- Depois da 3ª resposta, o campo dá lugar a uma mensagem de fim de turno e ao estado de espera.
- Leitor de tela: as respostas novas são anunciadas uma vez; o "• • •" tem rótulo acessível.

## Deduções destraváveis

- **As deduções são individuais.** Cada jogador destrava as suas nas suas conversas e só ele as vê. Compartilhar é falar em voz alta na mesa.
- Cada caso traz uma **lista fixa de deduções** escritas pelo autor, por exemplo "The weapon is not on this carriage." e "Martha has no clear motive." Cada uma tem `id`, texto curto e o(s) suspeito(s) e assunto(s) que a destravam.
- **Quem decide se destravou é a IA**, junto com a resposta: ela devolve o texto da fala e os `id`s das deduções que aquela troca revelou. **O servidor só aceita `id`s que podem ser destravados por aquele suspeito** e que o jogador ainda não tem. Uma dedução nunca nasce de texto livre da IA.
- Ao destravar: uma **animação no canto** do tipo conquista, "Deduction unlocked", com o texto da dedução, que some sozinha em poucos segundos sem roubar o foco do campo. Ela é anunciada uma vez pelo leitor de tela.
- **O jogo funciona sem IA** (desenvolvimento, CI, orçamento do dia esgotado, falha). Cada dedução declara também um gatilho fixo: suspeito + tópico. Quando a resposta é a reserva fixa daquele tópico, as deduções com esse gatilho destravam. Assim, a aba nunca fica só com cadeados num dia sem IA. Os testes de navegador usam esse caminho e um provedor de IA falso. *(Decisão de Claude.)*
- **A aba Deduce vira só revisão**: a lista das deduções destravadas, com de quem e de qual turno vieram, mais um contador "5 of 12 unlocked". As não destravadas aparecem como cadeados sem texto. *(O contador e os cadeados são decisão de Claude, no espírito de "conquistas".)*
- **A mesa precisa juntar as descobertas.** Nenhum jogador sozinho, com as 12 perguntas dele, deve conseguir fechar o caso. As deduções do caso são espalhadas entre os suspeitos de propósito, para que a conversa na mesa seja necessária. *(Decidido pelo dono.)*
- **Saem do jogo:** a montagem de correlações, as hipóteses com relação e fontes, a busca e os filtros do quadro, o seletor de tópico, **o "Share with team" e o quadro compartilhado inteiro** (ações `share`, `note`, `correlate` e o estado `board`). A mesa vira o quadro. *(Decidido pelo dono.)*

## Telas e navegação

- **Primeiro o celular**, de 320 a 430 px de largura; o desktop mostra a mesma coluna centralizada.
- **Escolher suspeito:** a grade do esboço. **Sem busca.** O caso tem 15 suspeitos e a grade com rolagem basta.
- **Navegação:** o que hoje são as etapas Analyse, Interrogate e Deduce vira algo leve no estilo de app: o chat é a tela principal do turno, e as deduções e o caso ("Known facts") ficam acessíveis por um ícone ou aba inferior. A forma exata fica com o construtor, mantendo o mínimo e sem sanfonas empilhadas embaixo do chat como hoje ("Host controls", "Investigation rules", "Recover earlier local drafts" saem do fluxo principal).
- Respeitar a área segura do iPhone (notch e barra inferior).
- **App instalável (PWA):** manifesto, ícones, `display: standalone`, `theme-color`, para "Adicionar à tela inicial" abrir como app. Não é app de loja. *(Decisão de Claude para "ser um mobile app" dentro do prazo da jam.)*

## Vídeos de fundo (estilo Andromeda)

O padrão é o da home do Andromeda (https://www.andromeda.terminalufo.com/):

- O `<video>` fica atrás do conteúdo da tela, ocupando tudo (`object-fit: cover`), com `autoplay muted loop playsinline`, `aria-hidden="true"` e um `poster`, e um véu escuro em degradê para manter o texto legível.
- **Sem controles, sem player, sem caixa, sem diálogo.** O diálogo "case films" atual sai.
- Com `prefers-reduced-motion: reduce`, só aparece o pôster (imagem parada).
- Pausar quando a aba some e retomar quando volta, por ser fundo e não conteúdo.
- **Vídeos em todo lugar:** cada tela tem o seu fundo. O construtor escolhe a distribuição dos 3 filmes existentes (`train`, `corridor`, `pocket-watch`), por exemplo train na abertura e na sala, corridor na escolha e no chat, pocket-watch na virada do turno e na revelação. Novos filmes ficam fora deste escopo.
- Os filmes atuais têm faixa de áudio. Como tocam mudos, o construtor pode reencodar sem áudio e mais leves.

## Mudanças no caso (dados)

- O formato do caso ganha: **o conhecimento de cada suspeito para a IA** (o que sabe, o que esconde, onde mente) e a **lista de deduções** com as regras de destravamento. As respostas fixas por tópico continuam, como reserva quando a IA falha.
- O validador (`scripts/check-case.mjs`) passa a validar os campos novos.
- **O caso público Bracken Quay** (o que está no ar) ganha esses campos. Claude escreve esse conteúdo a partir da solução que já está em `examples/public-demo.mjs` e das notas de autor.
- O caso editorial privado (`private/`) recebe os campos depois, por quem tem acesso. Fora deste escopo.

## Metas

- Uma partida completa de 3 ou 4 pessoas, cada uma no seu celular, flui de ponta a ponta sem formulários, sem dropdowns e sem esperar o host para cada passo.
- O interrogatório parece um mensageiro comum.
- Fica sempre claro qual é a próxima ação e quantas perguntas restam.
- Destravar uma dedução é um momento de prazer visível.

## Fora do escopo

- App nativo de loja (iOS/Android).
- Casos novos, filmes novos, voz e áudio.
- Traduzir a interface (continua em inglês britânico).
- Mudar a infraestrutura do Azure além do necessário para o caminho de IA já existente.

## O que seria fracasso mesmo funcionando

- A IA inventa um fato que contradiz a solução ou entrega o culpado de bandeja.
- O jogo trava esperando a IA, o host ou um jogador sumido.
- O interrogatório continua parecendo formulário: foco perdido, rolagem errada, controles demais.
- A mesa passa mais tempo lendo regras do que jogando.

## Restrições

- **Repositório público** (regra da jam): nada de chaves, caso privado ou dados pessoais no código.
- Manter o que já sustenta o jogo: servidor autoritativo, comandos idempotentes, armazenamento transacional (memória, DynamoDB e PostgreSQL) e a lista exata de assets públicos.
- Sem framework novo no front-end: continua em JavaScript puro, como hoje.
- Testes e CI (`npm test`, `npm run check`, `npm run test:browser`) continuam verdes e são atualizados para as regras novas.
- O custo da IA tem teto aplicado pelo código (o mecanismo de orçamento em `server/ai/budget.mjs`). Novos limites, *decididos pelo dono*: **US$ 0,25 por sala, US$ 10 por dia, US$ 50 por mês, até 8 chamadas simultâneas.** Os limites técnicos por chamada (tamanho do contexto, tokens de entrada e saída) podem subir para caber o caso, o histórico e as deduções, desde que uma partida de 4 jogadores × 12 perguntas caiba em US$ 0,25 com o modelo escolhido. A configuração `SHIFT_AI_POLICY` no Azure é atualizada para esses valores no deploy.
- **Chamadas pagas durante o desenvolvimento estão autorizadas, com teto total de US$ 5**, para avaliar com o modelo real que a IA não contradiz o caso nem entrega o culpado (na linha do `scripts/evaluate-interviews.mjs`). *(Decidido pelo dono.)*

## Deixado para o construtor

- A arquitetura da chamada à IA no caminho de cada pergunta (síncrona dentro do request ou job com polling) e como encaixá-la no orçamento e na idempotência existentes.
- O formato exato do prompt, do esquema de saída e do histórico.
- Os horários exatos dos turnos, a forma da navegação inferior, a animação da conquista e a distribuição dos vídeos por tela.
- A migração de salas em andamento (podem simplesmente expirar; salas vivem no máximo 24h).
- A ordem de entrega e como publicar no Azure (`scripts/azure-ci-deploy.py`).
