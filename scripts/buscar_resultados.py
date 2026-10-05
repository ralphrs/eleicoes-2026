#!/usr/bin/env python3
"""Busca a apuracao do 2o turno para presidente no TSE e grava em segundo-turno.json.

Uso:
  python3 scripts/buscar_resultados.py            # descobre o codigo da eleicao sozinho
  python3 scripts/buscar_resultados.py 6300       # usa o codigo informado

Grava o campo "resultado" com os numeros do pais, do RS e de SC. A pagina passa
a mostrar a apuracao no quadro do 2o turno assim que esse campo existe.
So usa a biblioteca padrao.
"""
import base64
import json
import pathlib
import sys
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://resultados.tse.jus.br/oficial"
ARQ = RAIZ / "segundo-turno.json"


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (eleicoes-2026)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def achar_eleicao(data_br):
    """Procura no ele-c.json o codigo da eleicao presidencial marcada para a data."""
    cfg = json.loads(baixar(f"{BASE}/comum/config/ele-c.json"))
    achados = []

    def anda(no):
        if isinstance(no, dict):
            if data_br in [v for v in no.values() if isinstance(v, str)]:
                achados.append(no)
            for v in no.values():
                anda(v)
        elif isinstance(no, list):
            for v in no:
                anda(v)

    anda(cfg)
    codigos = []
    for no in achados:
        texto = json.dumps(no, ensure_ascii=False).lower()
        for e in ([no] + [x for x in no.values() if isinstance(x, list) for x in x if isinstance(x, dict)]):
            cd = e.get("cd")
            if cd and str(cd).isdigit():
                codigos.append((("federal" in json.dumps(e, ensure_ascii=False).lower() or "presid" in texto), str(cd)))
    codigos.sort(reverse=True)
    return [c for _, c in codigos]


def ler(ele, uf):
    url = f"{BASE}/ele2026/{ele}/dados/{uf}/{uf}-c0001-e{int(ele):06d}-u.jws"
    partes = baixar(url).decode().strip().split(".")
    corpo = partes[1] + "=" * (-len(partes[1]) % 4)
    d = json.loads(base64.urlsafe_b64decode(corpo))
    cands = {}
    for agr in d["carg"][0]["agr"]:
        for par in agr["par"]:
            for c in par["cand"]:
                cands[c["n"]] = {"v": int(c["vap"]), "p": c["pvap"], "st": c.get("st", "")}
    return d, cands


def main():
    t2 = json.loads(ARQ.read_text(encoding="utf-8"))
    a, m, d = t2["data"].split("-")
    codigos = sys.argv[1:2] or achar_eleicao(f"{d}/{m}/{a}")
    if not codigos:
        sys.exit("Nao achei a eleicao do 2o turno no ele-c.json. Informe o codigo na linha de comando.")
    erro = None
    for ele in codigos:
        try:
            br, cbr = ler(ele, "br")
            if len(cbr) != 2:
                continue
            _, crs = ler(ele, "rs")
            _, csc = ler(ele, "sc")
        except Exception as e:  # tenta o proximo codigo
            erro = e
            continue
        if not sum(c["v"] for c in cbr.values()):
            print("Eleicao", ele, "ainda sem votos apurados; nada gravado.")
            return
        t2["resultado"] = {"eleicao": ele, "atualizado": f"{br['dt']} {br['ht']}", "secoes": br["s"]["pst"],
                           "br": cbr, "rs": crs, "sc": csc,
                           "totais": {"abstencao": br["e"]["pa"], "brancos": br["v"]["pvb"], "nulos": br["v"]["ptvn"]}}
        ARQ.write_text(json.dumps(t2, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Gravado:", ele, br["s"]["pst"] + "% das secoes", cbr)
        return
    sys.exit(f"Nenhum codigo serviu ({codigos}). Ultimo erro: {erro}")


if __name__ == "__main__":
    main()
