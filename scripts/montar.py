#!/usr/bin/env python3
"""Gera rs/index.html e sc/index.html a partir de src/pagina.html e src/partes.json.

Uso: python3 scripts/montar.py
Os dados (dados.json, resultados.json, noticias.json, ../segundo-turno.json)
sao carregados pela pagina em tempo de execucao; aqui so entra o que muda por UF.
"""
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
modelo = (RAIZ / "src" / "pagina.html").read_text(encoding="utf-8")
partes = json.loads((RAIZ / "src" / "partes.json").read_text(encoding="utf-8"))

for uf, p in partes.items():
    html = modelo
    for chave, valor in p.items():
        html = html.replace("{{" + chave + "}}", valor)
    if "{{P" in html:
        raise SystemExit(f"{uf}: sobrou marcador sem preencher")
    (RAIZ / uf / "index.html").write_text(html, encoding="utf-8")
    print(uf, len(html))
