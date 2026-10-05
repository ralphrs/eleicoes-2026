#!/usr/bin/env python3
"""Gera os arquivos da pagina de resultados (resultados/br.json, resultados/<uf>.json,
resultados/cidades.json e resultados/index.html) a partir dos dados brutos em fontes/.

fontes/tse-2026-cidades.json   votos por cidade (presidente, governador, Senado), eleitos
                               para a Camara e bancada atual, coletados em 5/10/2026
fontes/tse-2022-presidente.json  votos para presidente em 2022 por municipio (dados abertos do TSE)
Uso: python3 scripts/gerar_resultados.py
"""
import json, re, unicodedata, datetime
from pathlib import Path

R = Path(__file__).resolve().parent.parent
bruto = json.loads((R / "fontes/tse-2026-cidades.json").read_text(encoding="utf-8"))
b22 = json.loads((R / "fontes/tse-2022-presidente.json").read_text(encoding="utf-8"))
guia = json.loads((R / "rs/dados.json").read_text(encoding="utf-8"))
res_rs = json.loads((R / "rs/resultados.json").read_text(encoding="utf-8"))

NOMES = {"ac": "Acre", "al": "Alagoas", "ap": "Amapá", "am": "Amazonas", "ba": "Bahia", "ce": "Ceará", "df": "Distrito Federal", "es": "Espírito Santo", "go": "Goiás", "ma": "Maranhão", "mt": "Mato Grosso", "ms": "Mato Grosso do Sul", "mg": "Minas Gerais", "pa": "Pará", "pb": "Paraíba", "pr": "Paraná", "pe": "Pernambuco", "pi": "Piauí", "rj": "Rio de Janeiro", "rn": "Rio Grande do Norte", "rs": "Rio Grande do Sul", "ro": "Rondônia", "rr": "Roraima", "sc": "Santa Catarina", "sp": "São Paulo", "se": "Sergipe", "to": "Tocantins"}

# Campo dos partidos: Bolognesi, Ribeiro e Codato (2023). Fusoes seguem os partidos de origem;
# UP e Missao seguem a classificacao dos seus candidatos a presidente no guia.
CAMPO = {}
for campo, ps in {
    "esquerda": "PSTU PCO PCB PSOL PCdoB PT UP",
    "centro-esquerda": "PDT PSB REDE",
    "centro": "CIDADANIA PV",
    "centro-direita": "AVANTE SOLIDARIEDADE MOBILIZA PMB MDB PSD PSDB PODE PODEMOS PRTB PRD PTB",
    "direita": "REPUBLICANOS PL AGIR DC NOVO PP UNIAO MISSAO",
}.items():
    for p in ps.split():
        CAMPO[p.lower()] = campo
def chave(s):
    s = unicodedata.normalize("NFD", s or "")
    return re.sub(r"[^a-z]", "", "".join(c for c in s if unicodedata.category(c) != "Mn").lower())

def tit(s):
    return s  # nomes de urna ficam como o TSE publica; a pagina ajusta a caixa das cidades

# presidente: ordem nacional por votos, com o campo usado nos perfis do guia
esp = {c["num"]: c["esp"] for c in guia["cands"] if c["cargo"] == "presidente"}
nome_guia = {c["num"]: c["nome"] for c in guia["cands"] if c["cargo"] == "presidente"}
pres = sorted(bruto["meta"]["br"]["l"], key=lambda c: -c[3])
PRES = [[c[0], nome_guia.get(c[0], c[1].title()), c[2], c[3], c[4], c[5], esp.get(c[0])] for c in pres]
ordp = [c[0] for c in PRES]

# 2022: candidatos em ordem nacional de votos
tot22 = {}
for k, v in b22["agg"].items():
    if k.startswith("1|"):
        for n, q in v.items(): tot22[n] = tot22.get(n, 0) + q
ord22 = sorted(tot22, key=lambda n: -tot22[n])
C22 = []
for n in ord22:
    nm, pt = b22["cand"][n].split("|")
    C22.append([n, nm.title().replace(" D Avila", " d'Avila"), pt, CAMPO.get(chave(pt))])
AGG22 = {"|".join([a, b, str(int(c))]): v for (a, b, c), v in ((k.split("|"), v) for k, v in b22["agg"].items())}
def t22(uf, tse):
    v = AGG22.get(f"1|{uf.upper()}|{int(tse)}")
    if not v: return None
    arr = [v.get(n, 0) for n in ord22]
    return [sum(arr), arr]

def lista(m):  # [num, nome, partido, votos, pct, situacao] em ordem de votos
    return [[c[0], c[1].title(), c[2], c[3], c[4], c[5]] for c in sorted(m["l"], key=lambda c: -c[3])]

BRo = {"atualizado": res_rs["atualizado"].split()[0], "secoes": bruto["meta"]["br"]["pst"], "pres": PRES, "c22": C22, "campo": CAMPO, "uf": {}, "camara": {}, "camaraData": "5 de outubro de 2026"}
cidades = []
soma22 = [0] * len(ord22)
for uf, nome in NOMES.items():
    meta = bruto["meta"][uf]; u = bruto["uf"][uf]
    g, s = lista(meta["g"]), lista(meta["s"])
    og, os_ = [c[0] for c in g], [c[0] for c in s]
    fed = {}
    for c in meta["f"]["l"]: fed[c[2]] = fed.get(c[2], 0) + 1
    mun = []; u22 = [0] * len(ord22)
    for ibge, x in sorted(bruto[uf].items(), key=lambda kv: kv[1]["nm"]):
        p, gg, ss = x["p"], x["g"], x["s"]
        linha = [ibge, x["nm"], p["e"], p["cp"], p["vv"], [p["c"].get(n, 0) for n in ordp], gg["vv"], [gg["c"].get(n, 0) for n in og], ss["vv"], [ss["c"].get(n, 0) for n in os_]]
        t = t22(uf, x["tse"])
        if t:
            linha += t
            for i, q in enumerate(t[1]): u22[i] += q
        mun.append(linha); cidades.append([x["nm"], uf, ibge, p["e"]])
    for i, q in enumerate(u22): soma22[i] += q
    BRo["uf"][uf] = {"nome": nome, "e": u["e"], "cp": u["cp"], "vv": u["vv"], "p": [u["c"].get(n, 0) for n in ordp], "t22": {"vv": sum(u22), "v": u22},
                     "g": g, "s": s, "gvv": meta["g"]["vv"], "svv": meta["s"]["vv"], "fed": fed}
    (R / f"resultados/{uf}.json").write_text(json.dumps({"g": g, "s": s, "mun": mun}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
for nm, pt, uf in bruto["camara"]:
    BRo["camara"].setdefault(uf.lower(), {}); BRo["camara"][uf.lower()][pt] = BRo["camara"][uf.lower()].get(pt, 0) + 1
mb = bruto["meta"]["br"]
BRo["br"] = {"e": mb["e"], "cp": mb["cp"], "vv": mb["vv"], "p": [c[3] for c in PRES], "t22": {"vv": sum(soma22), "v": soma22}}
# pesquisas para presidente, convertidas em votos validos
pesq = []
for q in guia["pesq"]["presidente"]:
    ids = {c["id"]: c["num"] for c in guia["cands"] if c["cargo"] == "presidente"}
    r = {ids[k]: v for k, v in q["r"].items() if k in ids and v is not None}
    if "valid" not in (q.get("base") or ""):
        t = sum(r.values()) or 1
        r = {k: round(v / t * 100, 1) for k, v in r.items()}
    pesq.append({"inst": q["inst"], "div": q["div"], "r": r})
BRo["pesq"] = pesq
BRo["geo"] = json.loads((R / "resultados/geo/br.json").read_text())
(R / "resultados/br.json").write_text(json.dumps(BRo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
(R / "resultados/cidades.json").write_text(json.dumps(cidades, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

html = (R / "src/resultados.html").read_text(encoding="utf-8").replace("/*TOKENS*/", (R / "src/tokens.css").read_text(encoding="utf-8")).replace("/*VER*/", datetime.date.today().strftime("%Y%m%d"))
(R / "resultados/index.html").write_text(html, encoding="utf-8")
print("cidades", len(cidades), "| 2022 sem par:", sum(1 for uf in NOMES for m in json.loads((R / f'resultados/{uf}.json').read_text())['mun'] if len(m) < 12))
print("BR 2022:", [(c[1], round(soma22[i] / sum(soma22) * 100, 2)) for i, c in enumerate(C22)][:4])
print("partidos sem campo:", sorted({p for u in BRo['uf'].values() for l in (u['g'], u['s']) for c in l for p in [c[2]] if chave(p) not in CAMPO} | {p for u in BRo['uf'].values() for p in u['fed'] if chave(p) not in CAMPO} | {p for u in BRo['camara'].values() for p in u if chave(p) not in CAMPO}))
print("eleitos camara", sum(sum(u['fed'].values()) for u in BRo['uf'].values()), "pesq", pesq[:1])
