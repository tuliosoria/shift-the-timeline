// Server-only authored fixture. Never import this file from the browser bundle.
export const RULES = Object.freeze({ minPlayers: 3, maxPlayers: 4, rounds: 3, questions: 5 });
export const VISION = Object.freeze({
  title: 'Expresso da Meia-Noite', victim: 'Elisa Vale, auditora ferroviária',
  place: 'Vagão observatório do Expresso Aurora', method: 'Veneno no chá reservado à auditora',
  description: 'Daqui a 24 horas, Elisa cairá ao brindar a chegada do trem. Vocês conhecem a vítima, o lugar e o método, mas não o responsável. Investiguem os preparativos antes que a visão se cumpra.',
});
const person = (id, name, role, facts) => ({ id, name, role, facts });
export const SUSPECTS = [
  person('celia', 'Célia Prado', 'Coordenadora de cargas', [
    'Organizo a carga e as entregas aos vagões. Elisa vai auditar o manifesto na chegada.',
    'O armário de tratamento de madeira fica no depósito. A minha chave mestra abre esse armário.',
    'Assinei a requisição do composto V-7 às 18h de ontem. Era para tratar caixas.',
    'Pedi ao garçom que levasse a bandeja de Elisa ao depósito antes do serviço. Disse que era uma inspeção sanitária.',
    'Elisa encontrou caixas cobradas duas vezes no meu manifesto. Ela disse que apresentaria os documentos à polícia na chegada.',
  ]),
  person('rui', 'Rui Campos', 'Garçom', [
    'Elisa pediu chá de jasmim, sem açúcar, no observatório à meia-noite de amanhã.',
    'Cada bandeja fica lacrada na cozinha até o serviço. A de Elisa terá uma etiqueta azul.',
    'Célia deixou uma ordem assinada: devo passar com a bandeja azul pelo depósito antes de servir.',
    'Nunca houve inspeção sanitária de bandejas no depósito. A cozinha tem sua própria inspeção.',
    'Guardei a ordem: “bandeja azul, depósito, antes do observatório”, com a assinatura de Célia.',
  ]),
  person('ines', 'Inês Duarte', 'Química passageira', [
    'O V-7 é usado para tratar madeira. Uma pequena dose no chá pode ser letal.',
    'O composto não tem cheiro e dissolve em água quente. Não é ingrediente de cozinha.',
    'Vi Célia levar um frasco com rótulo V-7 do depósito ontem à noite.',
    'O frasco que vi estava cheio e lacrado. O registro de retirada deve estar com o almoxarife.',
    'A visão de morte após beber chá é compatível com V-7, mas compatibilidade química sozinha não identifica quem o usará.',
  ]),
  person('bento', 'Bento Luz', 'Almoxarife', [
    'Registro toda retirada do armário de produtos químicos. Ele não fica aberto.',
    'Ontem houve uma única retirada de V-7: às 18h, assinada por Célia Prado.',
    'A chave mestra de Célia abre o armário. O chefe do trem tem a única outra cópia.',
    'Nenhuma caixa foi tratada desde a retirada. O material continua seco e sem o selo de serviço.',
    'A requisição diz “tratamento urgente”, mas a ordem de manutenção foi cancelada antes das 18h.',
  ]),
  person('nara', 'Nara Reis', 'Assistente da auditora', [
    'Elisa encontrou cobranças duplicadas de carga e preservou as notas originais.',
    'As autorizações das cobranças levam a assinatura de Célia.',
    'Elisa avisou Célia de que levaria os documentos à polícia quando o trem chegasse.',
    'Elisa não pretende divulgar o relatório no jantar. Vai carregá-lo na pasta até a chegada.',
    'Eu reservei o chá de jasmim no observatório. O pedido tem uma etiqueta azul.',
  ]),
  person('tomas', 'Tomás Vidal', 'Chefe do trem', [
    'Autorizei Elisa a revisar o manifesto de cargas antes da chegada.',
    'Só eu e Célia temos chave do armário químico. A minha permanece lacrada no cofre de segurança.',
    'Não autorizei inspeção de alimentos no depósito. Isso violaria nosso procedimento.',
    'A cozinha confirmou que Célia solicitou sozinha uma alteração no trajeto da bandeja azul.',
    'A chave do cofre está com a segurança. Posso mostrar o lacre intacto, registrado esta manhã.',
  ]),
  person('olga', 'Olga Martins', 'Cozinheira', [
    'Os alimentos ficam separados dos produtos de manutenção.',
    'O chá de Elisa será preparado na cozinha e lacrado na bandeja azul.',
    'Célia me pediu uma inspeção extra no depósito; recusei, mas ela depois entregou a ordem ao garçom.',
    'Não há autorização sanitária para levar comida à carga. Tomás pode confirmar.',
    'O chá no estoque está íntegro. O desvio da bandeja abre uma oportunidade depois de sair daqui.',
  ]),
  person('davi', 'Davi Rocha', 'Mecânico', [
    'A manutenção das caixas foi cancelada ontem às 16h.',
    'Avisei Célia pessoalmente antes de ela retirar qualquer produto.',
    'V-7 exige selagem das caixas após aplicação. Nenhuma caixa tem selo novo.',
    'Minha equipe não pediu V-7 ontem. Bento guarda as requisições.',
    'Uma retirada após as 16h não corresponde a um serviço que eu tenha solicitado.',
  ]),
  person('lia', 'Lia Freire', 'Jornalista', [
    'Estou escrevendo sobre a linha ferroviária, não sobre um assassinato.',
    'Elisa me disse que as contas de carga não fechavam.',
    'Ouvi Célia dizer a Elisa: “Se você entregar essas notas, eu perco tudo”.',
    'Isso foi no corredor, depois da reunião de auditoria. Nara estava perto.',
    'Uma discussão é motivo para investigar, não prova de culpa. Procurem também acesso e preparação.',
  ]),
  person('caio', 'Caio Sena', 'Segurança', [
    'Inspecionei o lacre do cofre que guarda a chave de Tomás. Está intacto.',
    'A passagem entre cozinha e observatório não exige entrar no depósito.',
    'Vi a ordem de desvio da bandeja azul no quadro do garçom. Era assinada por Célia.',
    'Não recebi pedido de inspeção sanitária, nem escolta para a bandeja.',
    'As rondas cobrem o corredor principal, não o interior do depósito. O desvio deixaria a bandeja fora da vista.',
  ]),
  person('vera', 'Vera Amaral', 'Médica', [
    'Sou médica de bordo. O estojo de remédios está inventariado e lacrado.',
    'V-7 não é medicamento. É um composto industrial perigoso se ingerido.',
    'Uma intoxicação pelo chá exigiria contato com a bebida ou com a xícara depois do preparo.',
    'Se o plano for interrompido antes do serviço, não há razão para a visão se cumprir.',
    'A química Inês pode explicar o composto; eu não vi ninguém manuseá-lo.',
  ]),
  person('artur', 'Artur Leal', 'Pianista', [
    'Vou tocar no observatório durante a chegada, mas não preparo bebidas.',
    'Ouvi Elisa pedir um chá sem açúcar ao garçom Rui.',
    'Vi Célia consultar o horário da apresentação e anotar “bandeja azul”.',
    'Não sei por que uma coordenadora de cargas precisaria do horário das bebidas.',
    'Meu piano fica no salão, com vista para a entrada. O depósito não é parte do salão.',
  ]),
  person('maia', 'Maia Torres', 'Fotógrafa', [
    'Fotografei os trabalhadores do trem ontem, com permissão.',
    'Numa foto das 18h05, Célia sai do depósito com um frasco de rótulo V-7.',
    'A foto também mostra as caixas sem qualquer marca de tratamento.',
    'Bento estava no balcão quando ela saiu. Ele pode confirmar a retirada.',
    'A fotografia prova posse do frasco naquele momento, não o que ela pretende fazer depois.',
  ]),
  person('sara', 'Sara Nunes', 'Contadora', [
    'Revisei com Elisa uma amostra das contas de frete.',
    'Existem duplicatas autorizadas por Célia. As notas originais estão com Elisa.',
    'O prejuízo foi desviado para uma empresa controlada por Célia.',
    'Elisa informou que faria a denúncia na chegada, e Célia estava presente.',
    'Tomás autorizou a auditoria. Não há indício nas notas de que ele recebeu os valores desviados.',
  ]),
  person('leo', 'Léo Azevedo', 'Mensageiro', [
    'Entrego ordens entre os vagões; não tenho acesso ao armário químico.',
    'Levei a ordem de Célia ao garçom Rui. Pedi confirmação porque o trajeto era estranho.',
    'Ela insistiu: a bandeja azul deveria passar pelo depósito antes do observatório.',
    'A ordem não tinha assinatura do chefe Tomás nem da cozinheira Olga.',
    'Rui guardou o papel. É melhor conferir com ele do que confiar só na minha memória.',
  ]),
];
export const SOLUTION = Object.freeze({
  culpritId: 'celia', culprit: 'Célia Prado',
  explanation: 'Célia prepara o envenenamento para impedir que Elisa denuncie as cobranças duplicadas. Ela retirou V-7 após o cancelamento da manutenção e inventou uma inspeção para desviar a bandeja azul ao depósito. As contas ligam o motivo a Célia; o registro e a fotografia mostram acesso ao veneno; a ordem assinada cria a oportunidade. Nenhuma pista isolada bastava: o conjunto permite impedir o plano antes do serviço.',
  clues: ['Motivo: notas e denúncia (Nara, Sara ou Lia).', 'Meio: retirada de V-7 sem manutenção (Bento, Inês, Maia ou Davi).', 'Oportunidade: desvio assinado da bandeja azul (Rui, Olga, Caio ou Léo).'],
});
