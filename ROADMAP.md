# Roadmap

O que falta fazer no site, em ordem de prioridade dentro de cada bloco. Marque com `[x]` o que for concluído e anote a data.

As atualizações automáticas rodam em serviços gratuitos do Cloudflare: o Worker serve o site, o cron do Worker faz as coletas e o KV guarda o que muda de hora em hora. O repositório fica só com código e dados que mudam pouco.

## Antes de 25 de outubro

- [x] **Ensaiar a apuração na tela.** `?simular` no endereço das páginas de RS e SC mostra o quadro do 2º turno com números inventados, vindos de `/api/apuracao?teste=1`. (5/10)
- [x] **Atualizar a apuração sem recarregar.** No dia 25, a partir das 17h, o quadro busca a apuração de novo a cada minuto. (5/10)
- [ ] **Teste real da apuração.** Abrir `/api/apuracao` quando o TSE publicar a eleição do 2º turno e conferir se o código é encontrado e os números batem com o site do TSE.
- [ ] **Mapa do 2º turno na página de resultados.** Hoje ela só tem o 1º turno. Precisa da coleta por cidade rodando sozinha (item "Coleta por cidade sem navegador").
- [ ] **Home sem números escritos à mão.** Os percentuais de Flávio e Lula devem vir de `resultados/br.json`.

## Estrutura

- [x] **Notícias fora do Git.** A coleta de hora em hora passou para o cron do Worker e grava no KV; as páginas juntam `/api/noticias/<uf>` com o arquivo do repositório. O workflow do GitHub ficou só para rodar na mão. (5/10)
- [ ] **Coleta por cidade sem navegador.** Levar para o Worker (ou para um script) a coleta dos votos por município no TSE, que hoje foi feita à mão. Atenção ao limite de 50 requisições por execução no plano gratuito: são mais de 16 mil arquivos, então a coleta precisa ser fatiada.
- [ ] **Páginas mais leves.** Tirar as fotos em base64 de `dados.json` (quase 700 KB por estado) e carregar notícias só do candidato aberto.
- [ ] **Um arquivo só para os presidenciáveis.** Hoje os 12 estão copiados em `rs/dados.json` e `sc/dados.json`.
- [ ] **Escolher o endereço principal.** Desligar o GitHub Pages ou o Cloudflare, e desligar as duas tarefas agendadas dos artifacts do Claude.
- [ ] **Limpar os arquivos de notícias do repositório.** Depois de sete dias de coleta no KV, deixar em `noticias.json` só a seleção do semestre.

## Conteúdo

- [ ] **Rever os perfis depois do resultado.** Tirar a especulação de antes da eleição ("Deve ir ao 2º turno") e atualizar os fatos dos eleitos.
- [ ] **Apoios e pesquisas do 2º turno.** São preenchidos à mão em `segundo-turno.json`. Caiado ainda não se posicionou e não há pesquisa cadastrada.
- [ ] **Esquerda e direita em cinco faixas.** Opção de ver centro-esquerda e centro-direita separados, já que MDB, PSD e PSDB entram hoje na direita.
- [ ] **Antes e depois de governador e Senado**, e deputados estaduais na página de resultados.

## Acabamento

- [ ] **Mapa.** Malha municipal nova (sete cidades não aparecem desenhadas) e zoom no celular para estados com muitas cidades.
- [ ] **Prévia ao compartilhar.** Título e imagem próprios para o link de cada estado e cidade, gerados pelo Worker.
- [ ] **Medição de acessos**, com a opção gratuita e sem cookies do Cloudflare.
- [ ] **Teste automático.** Um teste que abre as páginas e falha se houver erro, rodando antes de cada publicação.
