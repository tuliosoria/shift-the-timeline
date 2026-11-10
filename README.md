# SHIFT: The Timeline

Jogo cooperativo de investigação para celular e navegador, em desenvolvimento para o [Game Off 2026](https://itch.io/jam/game-off-2026).

Uma visão revela a vítima, o lugar e a forma de um crime que ainda não aconteceu. A equipe tem 24 horas ficcionais para investigar, compartilhar pistas e mudar a linha do tempo sem prender inocentes.

## Estado do projeto

**Primeiro protótipo local, não uma versão de produção.** Uma sala com 3–4 investigadores percorre três turnos de entrevistas e uma acusação individual privada. O servidor mantém o estado e só revela a solução depois de todas as acusações. Há um caso original, o Expresso da Meia-Noite, com 15 suspeitos.

As entrevistas deste protótipo são **depoimentos roteirizados, sem IA ao vivo**: cada pergunta avança um dos cinco fatos escritos do personagem, independentemente da frase digitada. Isso permite testar o fluxo sem provedor, credenciais ou custo. O mistério ainda precisa de escrita, balanceamento e testes com grupos reais. Não há publicação no itch.io, hospedagem pública ou submissão à jam.

## Executar

Requisito: Node.js 22 ou superior. Não há dependências de runtime.

```sh
npm start
```

Abra `http://127.0.0.1:3000`. Para testar sozinho, use três abas abertas separadamente (não duplicadas) ou três perfis de navegador; cada aba guarda sua identidade em `sessionStorage`. Recarregar a mesma aba reconecta o jogador. Fechar a aba pode apagar a identidade, portanto não é uma conta permanente.

Para uma sessão de teste **em uma rede local confiável**, use `HOST=0.0.0.0 npm start` e o endereço local da máquina nos celulares. Não exponha esse servidor à internet: não há TLS, contas, persistência, proteção contra abuso de produção ou moderação. As salas e conversas ficam somente em memória, expiram após 24 horas e somem ao reiniciar o servidor. Use apenas nomes de teste e não compartilhe dados sensíveis.

## Jogar

1. Crie uma sala e compartilhe o código. O anfitrião inicia com 3–4 pessoas.
2. Leia vítima, local e método na visão. Escolha um suspeito por turno.
3. Faça até cinco perguntas; fixe no quadro apenas as informações que desejar compartilhar.
4. Encerre a entrevista. O turno avança quando todos terminam; o arquivo privado permite rever conversas anteriores.
5. Cada pessoa acusa em segredo. Todos acertam: vitória completa. Alguns acertam: crime impedido com inocentes presos. Ninguém acerta: derrota.

Se alguém abandonar a partida, o anfitrião pode removê-lo explicitamente. Se o anfitrião ficar sem atividade autenticada por 60 segundos, outro jogador pode assumir a sala e remover quem saiu. Quem apenas recarrega mantém o lugar; não há remoção automática por oscilação de rede. As acusações finais contam os jogadores que permanecerem. Essas são decisões de protótipo, não regras definitivas da jam.

## Verificar

```sh
npm test
npm run check
# Opcional: teste de interface com três clientes reais
npm ci
npx playwright install chromium
npm run test:browser
```

`CHROMIUM_PATH=/caminho/para/chromium npm run test:browser` usa um navegador já instalado. Os testes de API cobrem privacidade, barreiras de turno, limites, reconexão, repetição de pedidos, recuperação do anfitrião e três resultados. O teste de browser cobre o fluxo completo, mobile/desktop, Enter para entrar na sala, cancelamento, reconexão, perda de resposta e escape de notas. A CI executa os dois conjuntos.

## Documentação e próximos passos

- [Briefing e decisões em aberto](docs/BRIEFING.md)
- [Arquitetura, limites e próximos incrementos](docs/PROTOTYPE.md)
- [Regras verificadas e checklist da jam](docs/GAME_OFF.md)
- [Uso de IA e créditos](AI_AND_CREDITS.md)
- [Estado das licenças](LICENSE_STATUS.md)

Priorizar a consistência e a diversão de um caso antes de expandir para os cinco cenários. A integração de IA precisa manter a solução no servidor, restringir o conhecimento de cada personagem e medir custo, latência e resistência a instruções adversárias. Não publique chaves de API nem conversas privadas.

Prazo verificado da jam: **1º de dezembro de 2026, 13h37 PST / 21h37 UTC / 18h37 de Brasília**. Reconfirme as regras oficiais antes de submeter.
