"""Aplica em memória as correções de fontes/correcoes.json sobre os dados do TSE de 5/10.

Hoje: votos anulados depois do 1º turno (Garotinho, RJ) e a nova situação dos
candidatos. Os percentuais são refeitos sem os votos anulados, em cada cidade e no estado.
"""
import json
from pathlib import Path

R = Path(__file__).resolve().parent.parent


def fmt(x):
    return f"{x:.2f}".replace(".", ",")


def aplicar(bruto):
    corr = json.loads((R / "fontes/correcoes.json").read_text(encoding="utf-8"))
    for uf, c in corr.get("gov", {}).items():
        anul = set(c.get("anulados", []))
        m = bruto["meta"][uf]["g"]
        tirar = sum(x[3] for x in m["l"] if x[0] in anul)
        m["l"] = [x for x in m["l"] if x[0] not in anul]
        m["vv"] -= tirar
        for x in m["l"]:
            x[4] = fmt(x[3] / m["vv"] * 100)
            if x[0] in c.get("situacao", {}):
                x[5] = c["situacao"][x[0]]
        m["nota"], m["fontesNota"] = c.get("nota"), c.get("fontes", [])
        for cid in bruto[uf].values():
            g = cid["g"]
            for n in anul:
                g["vv"] -= g["c"].pop(n, 0)
    return corr
