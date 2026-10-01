# Candidatos 2026

Guia do eleitor para o primeiro turno de 4 de outubro de 2026, com uma página para o Rio Grande do Sul e outra para Santa Catarina. Cada uma mostra presidente, governador, Senado e deputados, com pesquisas, perfil, propostas, fatos a favor e contra, comparação entre dois candidatos e notícias.

## Como publicar

Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`. O site fica em `https://ralphrs.github.io/eleicoes-2026/`.

## Estrutura

- `index.html`: escolha do estado.
- `rs/index.html` e `sc/index.html`: as páginas. Os dados dos candidatos (TSE, pesquisas, perfis, fotos) estão embutidos no próprio arquivo.
- `rs/noticias.json` e `sc/noticias.json`: as notícias que cada página carrega. Itens com `"destaque": true` são a seleção fixa do semestre.
- `rs/candidatos.json` e `sc/candidatos.json`: quem a coleta de notícias acompanha e com que busca.
- `scripts/coletar_noticias.py`: consulta o Google Notícias (RSS) por candidato e atualiza os dois arquivos de notícias.
- `.github/workflows/noticias.yml`: roda o script de hora em hora e grava o resultado no repositório.

## Notícias

A rotina guarda até três notícias novas por candidato a cada rodada, só de veículos da lista `FONTES` do script e publicadas nas últimas 48 horas. Tudo sai depois de sete dias, menos a seleção do semestre. Para rodar na mão: aba **Actions → Atualizar notícias → Run workflow**, ou `python scripts/coletar_noticias.py` na sua máquina.

## Fontes

Candidaturas, números, situação dos registros, fotos e votações anteriores vêm do TSE. Pesquisas, perfis e propostas têm a origem indicada na aba Fontes de cada página.
