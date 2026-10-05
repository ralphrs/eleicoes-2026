#!/usr/bin/env python3
"""Gera a pagina de cada estado (menos RS e SC, que tem guia proprio), o arquivo
noticias-candidatos.json usado pela coleta do Worker e a lista de estados da home.

Entradas: fontes/tse-2026-cidades.json, fontes/tse-2026-estaduais-eleitos.json,
resultados/br.json (gerado por gerar_resultados.py), src/estado.html, rs|sc/candidatos.json
Uso: python3 scripts/gerar_estados.py
"""
import json, re, unicodedata, datetime
from pathlib import Path

R = Path(__file__).resolve().parent.parent
bruto = json.loads((R / "fontes/tse-2026-cidades.json").read_text(encoding="utf-8"))
est = json.loads((R / "fontes/tse-2026-estaduais-eleitos.json").read_text(encoding="utf-8"))["est"]
BR = json.loads((R / "resultados/br.json").read_text(encoding="utf-8"))
T2 = json.loads((R / "segundo-turno.json").read_text(encoding="utf-8"))
GUIA = ("rs", "sc")

MINUSC = {"de", "da", "do", "das", "dos", "e"}
def nome(s):
    out = []
    for i, p in enumerate(s.lower().split()):
        out.append(p if (i and p in MINUSC) else "-".join(x[:1].upper() + x[1:] for x in p.split("-")))
    t = " ".join(out)
    return re.sub(r"\b(Pm|Pt|Sus|Prf|Pf|Bm|Cb|Sgt|Dr|Dra)\b", lambda m: m.group(1).upper() if m.group(1) in ("Pm", "Pt", "Sus", "Prf", "Pf", "Bm") else m.group(1), t)
def slug(s):
    s = unicodedata.normalize("NFD", s)
    return re.sub(r"[^a-z0-9]+", "-", "".join(c for c in s if unicodedata.category(c) != "Mn").lower()).strip("-")

# palavra que o titulo da noticia precisa conter, para os finalistas a governador
TERMO = {"ac": ["Mailza", "Alan Rick"], "am": ["Omar Aziz", "Maria do Carmo"], "df": ["Celina", "Grass"], "es": ["Pazolini", "Ferraço"], "rj": ["Douglas Ruas", "Paes"], "rn": ["Cadu", "Allyson"], "to": ["Vicentinho", "Dorinha"]}

ufs = [[uf, BR["uf"][uf]["nome"]] for uf in sorted(BR["uf"], key=lambda u: BR["uf"][u]["nome"])]
html = (R / "src/estado.html").read_text(encoding="utf-8")
base = (R / "src/resultados.html").read_text(encoding="utf-8")
base_css = base[base.index("/*TOKENS*/") + len("/*TOKENS*/"):base.index("</style>")]
html = html.replace("/*TOKENS*/", (R / "src/tokens.css").read_text(encoding="utf-8")).replace("/*BASE*/", base_css).replace("/*VER*/", datetime.date.today().strftime("%Y%m%d"))

cand_noticias = {uf: json.loads((R / uf / "candidatos.json").read_text(encoding="utf-8")) for uf in GUIA}
resumo_home = {}
for uf, nm in ufs:
    m = bruto["meta"][uf]; u = BR["uf"][uf]
    lista = lambda x: [[c[0], nome(c[1]), c[2], c[3], c[4], c[5]] for c in sorted(x["l"], key=lambda c: -c[3])]
    g, s = lista(m["g"]), lista(m["s"])
    fin = [c for c in g if c[5] == "2º turno"]
    eleito = next((c for c in g if c[5] == "Eleito"), None)
    resumo_home[uf] = {"nome": nm, "gov": [[c[1], c[2], c[4]] for c in fin] if len(fin) == 2 else None, "eleito": [eleito[1], eleito[2], eleito[4]] if eleito else None}
    finalistas = None
    if len(fin) == 2:
        termos = TERMO[uf]
        finalistas = []
        for c in fin:
            t = next(x for x in termos if unicodedata.normalize("NFD", x).encode("ascii", "ignore").decode().lower() in unicodedata.normalize("NFD", c[1]).encode("ascii", "ignore").decode().lower())
            finalistas.append({"id": slug(c[1]), "nome": c[1], "busca": f'"{t}" governador {nm}', "termo": t.lower()})
        if uf not in GUIA: cand_noticias[uf] = finalistas
    if uf in GUIA: continue
    dados = {"uf": uf, "nome": nm, "secoes": m["g"]["pst"], "e": u["e"], "cp": u["cp"],
             "pres": {"vv": u["vv"], "l": [[c[0], c[1], c[2], u["p"][i], c[4], c[5], c[6]] for i, c in enumerate(BR["pres"])]},
             "g": {"vv": m["g"]["vv"], "l": g}, "s": {"vv": m["s"]["vv"], "l": s},
             "fed": [[c[0], nome(c[1]), c[2], c[3]] for c in sorted(m["f"]["l"], key=lambda c: -c[3])],
             "est": [[c[0], nome(c[1]), c[2], c[3]] for c in sorted(est[uf], key=lambda c: -c[3])],
             "cargoEst": "Deputados distritais" if uf == "df" else "Deputados estaduais",
             "finalistasGov": [{"id": f["id"], "nome": f["nome"]} for f in finalistas] if finalistas else None,
             "t2": {"data": T2["data"], "dataTexto": T2["dataTexto"]}, "campo": BR["campo"], "ufs": ufs}
    (R / uf).mkdir(exist_ok=True)
    (R / uf / "estado.json").write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (R / uf / "index.html").write_text(html.replace("{{NOME}}", nm).replace("{{UF}}", uf), encoding="utf-8")
(R / "noticias-candidatos.json").write_text(json.dumps(cand_noticias, ensure_ascii=False, indent=1), encoding="utf-8")
(R / "estados.json").write_text(json.dumps(resumo_home, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("estados:", len(ufs) - len(GUIA), "| com 2º turno:", [u for u in resumo_home if resumo_home[u]["gov"]])
print(json.dumps({k: [c["busca"] for c in v] for k, v in cand_noticias.items() if k not in GUIA}, ensure_ascii=False))
