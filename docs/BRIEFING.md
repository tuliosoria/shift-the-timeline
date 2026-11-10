# SHIFT: The Timeline

## Briefing de jogo

Status: conceito em desenvolvimento. Este documento descreve objetivos e decisões em aberto, não funcionalidades já implementadas.

## Visão
Jogo cooperativo de investigação para celular e navegador. Os jogadores integram uma unidade que prevê crimes e tem 24 horas ficcionais para mudar o futuro. Uma visão revela quem morrerá, onde e como, mas não identifica o assassino. O grupo entrevista suspeitos interpretados por IA, compartilha informações e tenta impedir o crime sem prender inocentes.

**Promessa:** vocês sabem o que vai acontecer. Conseguem descobrir quem fará isso antes que o tempo acabe?

## Público e plataforma
Jogo de festa para amigos, com pelo menos três jogadores. Um anfitrião cria uma sessão e compartilha um código; os demais entram pelo celular no navegador. A interface deve funcionar em telas pequenas, mas também em desktop. App nativo não é requisito decidido: o primeiro formato proposto é web responsiva, instalável posteriormente se fizer sentido.

## Fluxo de partida
1. O anfitrião cria a sessão; amigos entram usando o código. A partida começa com o mínimo de jogadores definido para o caso.
2. O jogo apresenta uma visão do crime, o prazo e os perfis dos suspeitos.
3. Em cada turno, cada jogador escolhe uma pessoa para entrevistar em uma conversa com IA. As entrevistas acontecem em paralelo. Os jogadores podem falar entre si e trocar informações.
4. Cada pessoa encerra sua entrevista; quando todos terminam, o turno avança automaticamente. As 24 horas pertencem à história, não exigem 24 horas reais de jogo.
5. Terminados os turnos, cada jogador faz sua acusação. O jogo revela o criminoso, o plano, as pistas e a nova linha do tempo.

## Resultado coletivo
- **Vitória completa:** todos acusam o assassino; o crime é impedido sem inocentes presos.
- **Vitória parcial:** pelo menos um jogador acerta e o crime é impedido, mas acusações erradas resultam em inocentes presos.
- **Derrota:** ninguém identifica o assassino, que permanece livre e conclui o crime.

Pontuação numérica, possibilidade de abstenção e tratamento de desconexões ainda devem ser definidos.

## Suspeitos, turnos e limite de jogadores
A equipe nunca deve conseguir entrevistar todos os suspeitos dentro da janela de investigação. Com X jogadores e Z turnos, cada pessoa fazendo uma entrevista por turno, há no máximo X × Z entrevistas. O caso precisa ter Y suspeitos distintos, com Y maior que X × Z para o tamanho máximo de equipe permitido. Escolher a mesma pessoa mais de uma vez consome capacidade e pode revelar perspectivas diferentes.

**Exemplos para testar, não decisões finais:** 3–4 jogadores, 5 turnos e 23 suspeitos; ou 3–4 jogadores, 3 turnos e 15 suspeitos. A escolha deve equilibrar duração de festa, carga de escrita e facilidade de lembrar personagens. É necessário decidir o limite final de jogadores, turnos, suspeitos e mensagens por entrevista. A quantidade final precisa respeitar a divisão das entrevistas entre vários jogadores.

## Cinco cenários pré-definidos
Casos clássicos em espaços fechados, cada qual com vítima, plano, linha do tempo, suspeitos e pistas próprios:
1. **Expresso da Meia-Noite:** assassinato em um trem de luxo.
2. **Morte no Cruzeiro:** crime durante um jantar em alto-mar.
3. **Mansão na Tempestade:** reunião familiar e testamento.
4. **O Último Espetáculo:** crime nos bastidores de um teatro.
5. **Hotel na Montanha:** hóspedes isolados por uma nevasca.

Títulos e detalhes são provisórios. Cada caso precisa de testes antes de ser considerado pronto. Evitar apresentar uma história existente como se fosse criação própria.

## Mistério justo e IA
O culpado, a motivação, o plano, a cronologia, álibis e conhecimento de cada suspeito são definidos antes da primeira pergunta e não mudam conforme os palpites. A IA interpreta a pessoa e só tem acesso aos fatos que ela conheceria, incluindo suas mentiras e segredos. Não deve revelar dados de outros personagens ou inventar evidências decisivas. O servidor mantém a solução e verifica acusações; não confia na conversa para alterar placar, estado ou regras.

As pistas essenciais devem ter caminhos redundantes: a equipe deixará pessoas sem entrevista. Isso não garante que qualquer conjunto aleatório de entrevistas resolva o caso; os casos precisam ser desenhados e testados para que escolhas razoáveis permitam uma dedução fundamentada. O jogo não deve depender de uma frase exata para liberar pista indispensável. A revelação final explica como as evidências se conectam à solução. A consistência da IA e resistência a instruções do jogador devem ser testadas, não apenas presumidas por um prompt.

## Experiência mobile
- Sala e entrada por código com botões grandes, acessíveis ao toque.
- Tela de visão: vítima, local, método e tempo restante ficcional, sem rolagem excessiva.
- Lista filtrável de suspeitos com retrato, nome, função e estado (não entrevistado, em entrevista, concluído).
- Chat legível com teclado do celular, contador de mensagens e botão claro de encerrar.
- Quadro de investigação com notas e pistas compartilhadas, preservando a decisão dos jogadores sobre o que compartilhar. O formato exato ainda precisa de aprovação.
- Indicador de quem terminou, turno atual e relógio da história; acessibilidade por contraste, leitor de tela, foco e tamanhos de texto.
- Acusação individual privada e resultado coletivo com explicação. Não mostrar spoilers antes da revelação.
- Reconexão, abandono, espera e privacidade das conversas precisam de regra explícita antes da implementação.

## Direção visual
Mistério clássico em espaços fechados, com uma camada futurista discreta: art déco, azul-noite, bordô e dourado, contrastando com elementos luminosos da visão temporal. Retratos expressivos e identidade visual consistente. As imagens geradas são conceitos, não telas finais nem implementação aprovada.

## Escopo e validação para Game Off
Construir uma experiência nova e substancial para SHIFT, com código público e declaração de uso de IA conforme regras da jam. Priorizar uma partida jogável ponta a ponta antes de expandir para os cinco casos. Testar cada caso com grupos diferentes, incluindo entrevistas inesperadas, combinações diversas de suspeitos, conexões instáveis e acusações mistas. Confirmar que as pistas são justas e que as respostas não contradizem a solução. Prazo verificado em 9 de novembro de 2026: 1º de dezembro de 2026, às 13h37 PST / 21h37 UTC / 18h37 de Brasília. Regras e checklist em [Game Off 2026](GAME_OFF.md).

## Decisões em aberto
- Quantos jogadores, turnos e suspeitos por caso; duração desejada da partida.
- Máximo de mensagens por entrevista e possibilidade de encerrar cedo.
- Regras de seleção simultânea e entrevistas repetidas.
- Como registrar/compartilhar pistas e se as conversas são privadas até compartilhadas.
- Política para quem desconecta e início/avanço sem travar indefinidamente.
- Pontuação numérica, abstenção e desempate, se necessários.
- Idiomas, nome final, conteúdo dos cinco casos e viabilidade de custo por sessão.
