# Candidatos 2026

Guia do eleitor das eleições de 2026, agora voltado ao segundo turno para presidente (25 de outubro), com uma página para o Rio Grande do Sul e outra para Santa Catarina. Cada uma mostra presidente, governador, Senado e deputados, com pesquisas, perfil, propostas, fatos a favor e contra, comparação entre dois candidatos e notícias.

## Como publicar

Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`. O site fica em `https://ralphrs.github.io/eleicoes-2026/`.

## Cloudflare

O endereço `eleicoes-2026.ralph-renato.workers.dev` roda no Cloudflare Workers, no plano gratuito, e cada push na `main` publica de novo. `wrangler.jsonc` publica a raiz como site estático (o que está em `.assetsignore` fica de fora) e `worker/index.js` cuida do que muda sozinho:

- **Banco**: um D1 chamado `eleicoes-2026`, com a tabela `noticias` e a tabela `config` (chave e valor em JSON).
- **Notícias**: o cron do Worker roda a coleta de hora em hora e grava no banco. As páginas leem `/api/noticias/rs` e `/api/noticias/sc`, que devolvem a seleção do semestre e os últimos sete dias. `/api/noticias/atualizar` roda a coleta na hora, se a última tiver mais de 50 minutos.
- **2º turno**: data, finalistas, pesquisas e apoios ficam na linha `segundo-turno` da tabela `config` e saem por `/api/segundo-turno`. Para cadastrar uma pesquisa ou um apoio basta alterar essa linha no painel do D1; não precisa publicar de novo. O `segundo-turno.json` do repositório fica como reserva.
- **Apuração do 2º turno**: `/api/apuracao` consulta o TSE na hora e guarda a resposta por um minuto. No dia 25, a partir das 17h, as páginas dos estados chamam essa rota a cada minuto. Para ensaiar a tela, abra `/rs/?simular`.

No GitHub Pages essas rotas não existem: as notícias e os dados do 2º turno ficam parados no que está no repositório e a apuração depende do workflow `resultados.yml`.

O que falta fazer está em `ROADMAP.md`.

## Estrutura

- `index.html`: escolha do estado e quadro do 2º turno.
- `src/pagina.html` e `src/partes.json`: o modelo das páginas dos estados e o pouco que muda de um para o outro. Depois de mexer neles, rode `python3 scripts/montar.py` para gerar `rs/index.html` e `sc/index.html`. Não edite os dois `index.html` dos estados na mão.
- `rs/dados.json` e `sc/dados.json`: candidatos, pesquisas, perfis, propostas e fotos.
- `rs/resultados.json` e `sc/resultados.json`: resultado oficial do 1º turno (TSE), por cargo e número de urna.
- `resultados/`: página de resultados de todos os estados, com mapa, do país até a cidade. `br.json` traz o país e os estados, cada `<uf>.json` as cidades do estado, `geo/` os mapas e `cidades.json` a lista usada na busca. Tudo é gerado por `python3 scripts/gerar_resultados.py` a partir de `fontes/` (votos por cidade do TSE em 2026, votos para presidente em 2022 e bancada atual da Câmara) e do modelo `src/resultados.html`. Não edite `resultados/index.html` na mão.
- `segundo-turno.json`: data, finalistas, pesquisas e apoios do 2º turno. Vale para os dois estados.
- `rs/noticias.json` e `sc/noticias.json`: as notícias que cada página carrega. Itens com `"destaque": true` são a seleção fixa do semestre.
- `rs/candidatos.json` e `sc/candidatos.json`: quem a coleta de notícias acompanha e com que busca. Hoje são os dois finalistas e os eleitos para governo e Senado.
- `scripts/coletar_noticias.py` e `.github/workflows/noticias.yml`: coleta de notícias, de hora em hora.
- `scripts/buscar_resultados.py` e `.github/workflows/resultados.yml`: apuração do 2º turno.

## Segundo turno

Para cadastrar uma pesquisa, acrescente no começo da lista `pesquisas` de `segundo-turno.json` (a página mostra a primeira):

```json
{ "inst": "Datafolha", "div": "2026-10-10", "reg": "BR-00000/2026", "r": { "flavio-bolsonaro": 48, "lula": 46 } }
```

Para registrar um apoio declarado, use o id do candidato que apoiou em `apoios`. O texto aparece no perfil dele:

```json
"apoios": { "augusto-cury": { "texto": "Declarou apoio a Fulano em 7 de outubro.", "fonte": "https://..." } }
```

No dia 25, o workflow **Apuração do 2º turno** roda sozinho de 10 em 10 minutos a partir das 17h e grava o campo `resultado` em `segundo-turno.json`; o quadro do 2º turno passa a mostrar a apuração. Também dá para rodar na mão pela aba Actions, informando o código da eleição no TSE se a descoberta automática falhar. Essa rotina ainda não foi testada a partir do GitHub: o endereço dos arquivos foi conferido no 1º turno, mas o código da eleição do 2º turno só aparece perto da data.

## Notícias

A coleta guarda até três notícias novas por candidato a cada rodada, só de veículos da lista `FONTES` e publicadas nas últimas 48 horas. Tudo sai depois de sete dias, menos a seleção do semestre, que fica no `noticias.json` de cada estado. A coleta oficial é a do Worker; `scripts/coletar_noticias.py` e o workflow **Atualizar notícias** continuam no repositório para rodar na mão, se for preciso.

## Fontes

Candidaturas, números, situação dos registros, fotos e votações anteriores vêm do TSE. Pesquisas, perfis e propostas têm a origem indicada na aba Fontes de cada página.
