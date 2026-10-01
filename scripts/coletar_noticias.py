#!/usr/bin/env python3
"""Atualiza rs/noticias.json e sc/noticias.json a partir do Google Notícias (RSS).

Roda de hora em hora pelo GitHub Actions. Só usa a biblioteca padrão.
Regras: guarda até 3 notícias novas por candidato a cada rodada, apenas de
veículos da lista FONTES, publicadas nas últimas 48 horas. Itens com
"destaque": true (seleção fixa do semestre) nunca são removidos. Os demais
saem depois de 7 dias.
"""
import datetime as dt
import email.utils
import hashlib
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FONTES = [
    "g1", "folha", "estadão", "estadao", "uol", "cnn brasil", "o globo", "valor",
    "agência brasil", "agencia brasil", "poder360", "gazeta do povo", "metrópoles",
    "metropoles", "cartacapital", "bbc", "jota", "infomoney", "veja", "band",
    "gzh", "zero hora", "correio do povo", "jornal do comércio", "sul21", "matinal",
    "nsc total", "nd mais", "ndmais", "agência senado", "câmara dos deputados", "tse",
]
POR_CANDIDATO = 3
JANELA_HORAS = 48
DIAS_NO_FEED = 7


def buscar(consulta):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": consulta + " when:2d", "hl": "pt-BR", "gl": "BR", "ceid": "BR:pt-419"})
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (eleicoes-2026)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return ET.fromstring(r.read())


def itens_do_rss(raiz):
    for item in raiz.iter("item"):
        fonte = (item.findtext("source") or "").strip()
        titulo = (item.findtext("title") or "").strip()
        if fonte and titulo.endswith(" - " + fonte):
            titulo = titulo[: -len(" - " + fonte)]
        try:
            pub = email.utils.parsedate_to_datetime(item.findtext("pubDate"))
        except Exception:
            pub = None
        yield titulo, (item.findtext("link") or "").strip(), fonte, pub


def atualizar(uf):
    pasta = RAIZ / uf
    arq = pasta / "noticias.json"
    dados = json.loads(arq.read_text(encoding="utf-8"))
    cands = json.loads((pasta / "candidatos.json").read_text(encoding="utf-8"))
    agora = dt.datetime.now(dt.timezone.utc)
    rodada = agora.strftime("%Y-%m-%dT%H:%M:%SZ")
    limite = agora - dt.timedelta(hours=JANELA_HORAS)
    itens = dados.get("itens", [])
    urls = {i["url"] for i in itens}
    titulos = {(i["cand"], i["titulo"].lower()) for i in itens}
    novos = 0
    for c in cands:
        try:
            raiz = buscar(c["busca"])
        except Exception as e:  # uma falha não derruba a rodada
            print(f"[{uf}] falha em {c['id']}: {e}", file=sys.stderr)
            continue
        n = 0
        sobrenome = c["nome"].split()[-1].lower()
        for titulo, link, fonte, pub in itens_do_rss(raiz):
            if n >= POR_CANDIDATO:
                break
            if not link or link in urls or (c["id"], titulo.lower()) in titulos:
                continue
            if not any(f in fonte.lower() for f in FONTES):
                continue
            if pub is None or pub < limite:
                continue
            if sobrenome not in titulo.lower() and c["nome"].lower() not in titulo.lower():
                continue  # o título precisa citar o candidato
            itens.append({"cand": c["id"], "titulo": titulo, "url": link, "fonte": fonte,
                          "publicado": pub.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                          "coletado": rodada, "rodada": rodada})
            urls.add(link)
            titulos.add((c["id"], titulo.lower()))
            n += 1
            novos += 1
        time.sleep(1)
    corte = (agora - dt.timedelta(days=DIAS_NO_FEED)).strftime("%Y-%m-%dT%H:%M:%SZ")
    itens = [i for i in itens if i.get("destaque") or str(i.get("coletado", "")) >= corte]
    dados["itens"] = itens
    dados["meta"] = {"ultimaRodada": rodada, "novosNaUltima": novos}
    arq.write_text(json.dumps(dados, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"[{uf}] {novos} notícias novas, {len(itens)} no arquivo")


if __name__ == "__main__":
    for uf in ("rs", "sc"):
        atualizar(uf)
