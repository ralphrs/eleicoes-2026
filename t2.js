// Painel das pesquisas do 2º turno para presidente.
// Vai em qualquer página que tenha <div id="t2-pesquisas"></div> e use os tokens do design system.
// Os dados vêm de /api/segundo-turno (banco D1, no Cloudflare) ou, sem a rota, de /segundo-turno.json.
// Gráfico de linha: média das últimas pesquisas de cada instituto (janela de 7 dias), em votos válidos,
// com cada pesquisa como ponto. Cores das séries: espectro do campo (direita, esquerda), com passo
// próprio no tema escuro para passar no validador de paleta (divergência registrada no ROADMAP).
(() => {
  const BASE = new URL(".", document.currentScript.src).href;
  const FIN = [["flavio-bolsonaro", "Flávio Bolsonaro", "22", "dir"], ["lula", "Lula", "13", "esq"]];
  const JANELA = 7; // dias
  const css = `
.t2p { --s-dir: var(--espectro-direita); --s-esq: var(--espectro-esquerda); display: flex; flex-direction: column; gap: var(--space-3); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .t2p { --s-dir: #9a7bdc; --s-esq: #d96c57; } }
:root[data-theme="dark"] .t2p { --s-dir: #9a7bdc; --s-esq: #d96c57; }
.t2p h2 { font: 800 22px/1.2 var(--font-display); letter-spacing: -0.02em; margin: 0; }
.t2p .rot { font: 500 11px/16px var(--font-mono); color: var(--tinta-suave); text-transform: uppercase; letter-spacing: .06em; }
.t2p .cx { background: var(--papel-elevado); border: 1px solid var(--linha); border-radius: var(--radius-xl); box-shadow: var(--sombra-sm); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.t2p .med { display: flex; flex-wrap: wrap; gap: 6px 22px; align-items: baseline; }
.t2p .med span { display: inline-flex; align-items: baseline; gap: 8px; font-size: 14px; color: var(--tinta-suave); }
.t2p .med b { font: 700 26px/1 var(--font-mono); font-variant-numeric: tabular-nums; color: var(--tinta); }
.t2p .med i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; align-self: center; }
.t2p .nota { margin: 0; font-size: 12.5px; line-height: 19px; color: var(--tinta-suave); max-width: 80ch; }
.t2p svg { display: block; width: 100%; height: auto; overflow: visible; }
.t2p svg text { font: 500 11px var(--font-mono); fill: var(--tinta-suave); font-variant-numeric: tabular-nums; }
.t2p svg .grade { stroke: var(--linha); stroke-width: 1; }
.t2p svg .meio { stroke: var(--tinta-suave); stroke-width: 1; stroke-dasharray: 3 3; }
.t2p svg .ponto { stroke: var(--papel-elevado); stroke-width: 2; opacity: .55; }
.t2p svg .alvo { fill: transparent; cursor: pointer; }
.t2p svg .alvo:focus-visible { outline: none; stroke: var(--foco); stroke-width: 2; }
.t2p svg .rotulo { font: 700 12px var(--font-mono); fill: var(--tinta); }
.t2p .leg { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12.5px; color: var(--tinta-suave); align-items: center; }
.t2p .leg i { display: inline-block; border: 0; border-radius: 1px; width: 18px; height: 2px; vertical-align: middle; margin-right: 6px; }
.t2p .leg i.p { width: 8px; height: 8px; border-radius: 50%; opacity: .55; }
.t2p details summary { cursor: pointer; font-weight: 600; font-size: 14px; }
.t2p .tabw { overflow-x: auto; margin-top: 10px; }
.t2p table { border-collapse: collapse; width: 100%; font-size: 13px; }
.t2p th, .t2p td { text-align: left; padding: 6px 10px; border-top: 1px solid var(--linha); white-space: nowrap; }
.t2p th { font: 500 10.5px/14px var(--font-mono); color: var(--tinta-suave); text-transform: uppercase; letter-spacing: .06em; border-top: 0; }
.t2p td.n, .t2p th.n { text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.t2p td a { color: inherit; }
.t2p-dica { position: fixed; z-index: 20; pointer-events: none; background: var(--tinta); color: var(--papel); border-radius: var(--radius-md); padding: 6px 10px; font-size: 12.5px; line-height: 17px; max-width: 240px; box-shadow: var(--sombra-md); }
`;
  const st = document.createElement("style"); st.textContent = css; document.head.append(st);
  const SVGNS = "http://www.w3.org/2000/svg";
  const el = (t, a = {}, ...k) => { const svg = a.svg; const e = svg ? document.createElementNS(SVGNS, t) : document.createElement(t); for (const [n, v] of Object.entries(a)) { if (n === "svg" || v == null || v === false) continue; if (n.startsWith("on")) e.addEventListener(n.slice(2), v); else e.setAttribute(n, v); } for (const x of k.flat()) if (x != null && x !== false) e.append(x.nodeType ? x : String(x)); return e; };
  const pc = (x) => x.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  const dia = (s) => new Date(s + "T12:00:00");
  const dm = (s) => s.split("-").reverse().slice(0, 2).join("/");
  // percentual em votos válidos (o instituto pode ter divulgado em votos totais)
  const validos = (p) => { const f = +p.r[FIN[0][0]], l = +p.r[FIN[1][0]]; return [f / (f + l) * 100, l / (f + l) * 100]; };
  // média das últimas pesquisas de cada instituto divulgadas até a data, nos 7 dias anteriores
  const media = (ps, ate) => {
    const lim = dia(ate) - JANELA * 864e5, por = new Map();
    for (const p of ps) { if (p.div > ate || dia(p.div) < lim) continue; const o = por.get(p.inst); if (!o || p.div > o.div) por.set(p.inst, p); }
    const l = [...por.values()]; if (!l.length) return null;
    const v = l.map(validos); return { f: v.reduce((s, x) => s + x[0], 0) / l.length, l: v.reduce((s, x) => s + x[1], 0) / l.length, n: l.length, inst: l };
  };
  const dica = el("div", { class: "t2p-dica", hidden: "" }); document.body.append(dica);
  const mostra = (e, txt) => { dica.hidden = false; dica.replaceChildren(...txt.flatMap((t, i) => i ? [el("br"), t] : [t])); const x = e.clientX ?? 0, y = e.clientY ?? 0; dica.style.left = Math.min(innerWidth - 250, x + 14) + "px"; dica.style.top = y + 14 + "px"; };
  const esconde = () => { dica.hidden = true; };

  function grafico(ps, box) {
    const W = Math.max(300, box.clientWidth), H = W < 520 ? 220 : 260, m = { t: 14, r: W < 520 ? 96 : 120, b: 26, l: 34 };
    const datas = [...new Set(ps.map((p) => p.div))].sort();
    const serie = datas.map((d) => ({ d, ...media(ps, d) }));
    const pts = ps.map((p) => ({ p, v: validos(p) }));
    const vals = pts.flatMap((x) => x.v).concat(serie.flatMap((s) => [s.f, s.l]));
    let y0 = Math.floor(Math.min(...vals, 48) - 0.5), y1 = Math.ceil(Math.max(...vals, 52) + 0.5);
    const t0 = dia(datas[0]) - 864e5, t1 = +dia(datas[datas.length - 1]);
    const X = (d) => m.l + (dia(d) - t0) / (t1 - t0) * (W - m.l - m.r), Y = (v) => m.t + (y1 - v) / (y1 - y0) * (H - m.t - m.b);
    const svg = el("svg", { svg: 1, viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": `Média das pesquisas do 2º turno, em votos válidos, de ${dm(datas[0])} a ${dm(datas[datas.length - 1])}. Na última data, Flávio Bolsonaro ${pc(serie[serie.length - 1].f)} e Lula ${pc(serie[serie.length - 1].l)}. A tabela abaixo traz cada pesquisa.` });
    const passo = (y1 - y0) > 10 ? 4 : 2;
    for (let v = Math.ceil(y0 / passo) * passo; v <= y1; v += passo) {
      svg.append(el("line", { svg: 1, class: v === 50 ? "meio" : "grade", x1: m.l, x2: W - m.r + 8, y1: Y(v), y2: Y(v) }), el("text", { svg: 1, x: m.l - 6, y: Y(v) + 4, "text-anchor": "end" }, v + "%"));
    }
    if (y0 < 50 && y1 > 50 && (50 % passo)) svg.append(el("line", { svg: 1, class: "meio", x1: m.l, x2: W - m.r + 8, y1: Y(50), y2: Y(50) }));
    const nx = W < 520 ? 4 : 7, step = Math.max(1, Math.ceil(datas.length / nx));
    datas.forEach((d, i) => { if (i % step === 0 || i === datas.length - 1) svg.append(el("text", { svg: 1, x: X(d), y: H - 6, "text-anchor": "middle" }, dm(d))); });
    // pontos de cada pesquisa
    pts.forEach(({ p, v }) => FIN.forEach((f, j) => svg.append(el("circle", { svg: 1, class: "ponto", cx: X(p.div), cy: Y(v[j]), r: 4, fill: `var(--s-${f[3]})` }))));
    // linhas da média
    FIN.forEach((f, j) => {
      const dpath = serie.map((s, i) => (i ? "L" : "M") + X(s.d).toFixed(1) + " " + Y(j ? s.l : s.f).toFixed(1)).join(" ");
      svg.append(el("path", { svg: 1, d: dpath, fill: "none", stroke: `var(--s-${f[3]})`, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      const u = serie[serie.length - 1]; svg.append(el("circle", { svg: 1, cx: X(u.d), cy: Y(j ? u.l : u.f), r: 4, fill: `var(--s-${f[3]})`, stroke: "var(--papel-elevado)", "stroke-width": 2 }));
    });
    // rótulos diretos no fim das linhas, sem colisão
    const u = serie[serie.length - 1]; let yf = Y(u.f), yl = Y(u.l);
    if (Math.abs(yf - yl) < 16) { const c = (yf + yl) / 2, s = yf < yl ? -1 : 1; yf = c + s * 8; yl = c - s * 8; }
    svg.append(el("text", { svg: 1, class: "rotulo", x: X(u.d) + 10, y: yf + 4 }, (W < 520 ? "Flávio " : "Flávio B. ") + pc(u.f)), el("text", { svg: 1, class: "rotulo", x: X(u.d) + 10, y: yl + 4 }, "Lula " + pc(u.l)));
    // alvos de hover e teclado, um por data
    serie.forEach((s, i) => {
      const x = X(s.d), w = Math.max(16, (W - m.l - m.r) / Math.max(1, datas.length - 1));
      const doDia = pts.filter((q) => q.p.div === s.d).map((q) => `${q.p.inst}: Flávio ${pc(q.v[0])} · Lula ${pc(q.v[1])}`);
      const txt = [`Média em ${dm(s.d)} (${s.n} institutos)`, `Flávio ${pc(s.f)} · Lula ${pc(s.l)}`, ...(doDia.length ? ["Divulgadas no dia:", ...doDia] : [])];
      const r = el("rect", { svg: 1, class: "alvo", x: x - w / 2, y: m.t, width: w, height: H - m.t - m.b, tabindex: 0, "aria-label": txt.join(". ") });
      r.addEventListener("mousemove", (e) => mostra(e, txt)); r.addEventListener("mouseleave", esconde);
      r.addEventListener("focus", () => { const b = r.getBoundingClientRect(); mostra({ clientX: b.left + b.width / 2, clientY: b.top + 20 }, txt); }); r.addEventListener("blur", esconde);
      svg.append(r);
    });
    return svg;
  }

  function render(box, T2) {
    const ps = (T2.pesquisas || []).filter((p) => p.r && p.r[FIN[0][0]] != null && p.r[FIN[1][0]] != null && p.div).sort((a, b) => a.div.localeCompare(b.div));
    if (!ps.length) { box.replaceChildren(); return; }
    const ult = ps[ps.length - 1].div, M = media(ps, ult), dif = M.f - M.l;
    const lider = Math.abs(dif) < 1 ? null : dif > 0 ? FIN[0][1] : FIN[1][1];
    const titulo = lider ? `${lider} à frente na média das pesquisas, por ${pc(Math.abs(dif)).replace("%", " ponto" + (Math.abs(dif) >= 2 ? "s" : ""))}` : "Flávio Bolsonaro e Lula empatados na média das pesquisas";
    const area = el("div", {});
    const corpo = el("tbody", {}, ps.slice().reverse().map((p) => { const v = validos(p); return el("tr", {}, el("td", {}, p.url ? el("a", { href: p.url, rel: "noopener", target: "_blank" }, p.inst) : p.inst), el("td", {}, dm(p.div)), el("td", { class: "n" }, pc(v[0])), el("td", { class: "n" }, pc(v[1])), el("td", {}, p.base === "votos válidos" ? "válidos" : `totais: ${p.r[FIN[0][0]]}% x ${p.r[FIN[1][0]]}%`), el("td", {}, p.reg || "")); }));
    box.replaceChildren(el("section", { class: "t2p", "aria-labelledby": "t2p-tit" },
      el("div", {}, el("div", { class: "rot" }, "2º turno · presidente · pesquisas"), el("h2", { id: "t2p-tit" }, titulo)),
      el("div", { class: "cx" },
        el("div", { class: "med" }, FIN.map((f, j) => el("span", {}, el("i", { style: `background:var(--s-${f[3]})`, "aria-hidden": "true" }), f[1], el("b", {}, pc(j ? M.l : M.f))))),
        el("p", { class: "nota" }, `Média simples da última pesquisa de cada um dos ${M.n} institutos que divulgaram números entre ${dm(new Date(dia(ult) - (JANELA - 1) * 864e5).toISOString().slice(0, 10))} e ${dm(ult)}, em votos válidos. Pesquisa não é previsão, e a margem de erro de cada uma fica entre 1 e 2,6 pontos.`),
        area,
        el("div", { class: "leg" }, FIN.map((f) => el("span", {}, el("i", { style: `background:var(--s-${f[3]})`, "aria-hidden": "true" }), f[1] + ", média")), el("span", {}, el("i", { class: "p", style: "background:var(--tinta-suave)", "aria-hidden": "true" }), "cada pesquisa"), el("span", {}, "linha tracejada: 50%")),
        el("details", {}, el("summary", {}, `Ver as ${ps.length} pesquisas`), el("div", { class: "tabw" }, el("table", {}, el("thead", {}, el("tr", {}, ["Instituto", "Divulgação", "Flávio", "Lula", "Base", "Registro"].map((h, i) => el("th", { class: i === 2 || i === 3 ? "n" : null }, h)))), corpo))),
        el("p", { class: "nota" }, "Quando o instituto divulgou em votos totais, a conta foi refeita sem brancos, nulos e indecisos. Só entram pesquisas com registro no TSE, conferidas em veículos conhecidos."))));
    const desenha = () => area.replaceChildren(grafico(ps, area));
    desenha();
    let w = area.clientWidth; new ResizeObserver(() => { if (Math.abs(area.clientWidth - w) > 20) { w = area.clientWidth; desenha(); } }).observe(area);
  }

  async function carrega() {
    const box = document.getElementById("t2-pesquisas"); if (!box) return;
    let T2 = null;
    try { const r = await fetch("/api/segundo-turno", { cache: "no-store" }); if (r.ok && (r.headers.get("content-type") || "").includes("json")) T2 = await r.json(); } catch (e) {}
    if (!T2 || !T2.pesquisas) { try { T2 = await (await fetch(BASE + "segundo-turno.json?v=" + Math.floor(Date.now() / 3e5))).json(); } catch (e) { return; } }
    render(box, T2);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", carrega); else carrega();
})();
