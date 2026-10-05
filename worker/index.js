// Worker do site: os arquivos estáticos saem direto do repositório (binding ASSETS).
// Rotas com código:
//   /api/apuracao             apuração do 2º turno para presidente (país, RS e SC), lida no TSE e guardada por 1 minuto
//   /api/apuracao?teste=1     números inventados, para ensaiar a tela
//   /api/noticias/<uf>        notícias do banco D1 (seleção do semestre e últimos 7 dias), guardadas por 5 minutos
//   /api/segundo-turno        data, finalistas, pesquisas e apoios do 2º turno, lidos do banco (tabela config)
//   /api/noticias/atualizar   roda a coleta na hora, se a última tiver mais de 50 minutos
// O cron do Worker roda a coleta de notícias de hora em hora.

const BASE = "https://resultados.tse.jus.br/oficial";
const DATA_2T = "25/10/2026";

const baixar = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; eleicoes-2026; +https://github.com/ralphrs/eleicoes-2026)", "Accept": "application/rss+xml, application/xml, text/xml, application/json, */*", "Accept-Language": "pt-BR,pt;q=0.9" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.text();
};

// Procura no ele-c.json os códigos de eleição marcados para a data do 2º turno.
async function codigos() {
  const cfg = JSON.parse(await baixar(`${BASE}/comum/config/ele-c.json`));
  const achados = [];
  const anda = (no) => {
    if (Array.isArray(no)) return no.forEach(anda);
    if (!no || typeof no !== "object") return;
    if (Object.values(no).includes(DATA_2T)) achados.push(no);
    Object.values(no).forEach(anda);
  };
  anda(cfg);
  const out = [];
  for (const no of achados) {
    const itens = [no, ...Object.values(no).filter(Array.isArray).flat().filter((x) => x && typeof x === "object")];
    for (const e of itens) if (e.cd && /^\d+$/.test(String(e.cd))) out.push(String(e.cd));
  }
  return [...new Set(out)];
}

async function ler(ele, uf) {
  const jws = await baixar(`${BASE}/ele2026/${ele}/dados/${uf}/${uf}-c0001-e${String(ele).padStart(6, "0")}-u.jws`);
  const corpo = jws.trim().split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0))));
  const cands = {};
  for (const agr of d.carg[0].agr) for (const par of agr.par) for (const c of par.cand) cands[c.n] = { v: +c.vap, p: c.pvap, st: c.st || "" };
  return { d, cands };
}

async function apuracao(forcado) {
  const lista = forcado ? [forcado] : await codigos();
  let erro = null;
  for (const ele of lista) {
    try {
      const br = await ler(ele, "br");
      if (Object.keys(br.cands).length !== 2) continue;
      if (!Object.values(br.cands).some((c) => c.v > 0)) return { resultado: null, motivo: "sem votos apurados" };
      const [rs, sc] = await Promise.all([ler(ele, "rs"), ler(ele, "sc")]);
      return { resultado: { eleicao: ele, atualizado: `${br.d.dt} ${br.d.ht}`, secoes: br.d.s.pst, br: br.cands, rs: rs.cands, sc: sc.cands,
        totais: { abstencao: br.d.e.pa, brancos: br.d.v.pvb, nulos: br.d.v.ptvn } } };
    } catch (e) { erro = String(e); }
  }
  return { resultado: null, motivo: erro || "eleição do 2º turno ainda não publicada pelo TSE" };
}


// ---------- notícias ----------
const FONTES = ["g1", "folha", "estadão", "estadao", "uol", "cnn brasil", "o globo", "valor", "agência brasil", "agencia brasil", "poder360", "gazeta do povo", "metrópoles", "metropoles", "cartacapital", "bbc", "jota", "infomoney", "veja", "band", "gzh", "zero hora", "correio do povo", "jornal do comércio", "sul21", "matinal", "nsc total", "nd mais", "ndmais", "agência senado", "câmara dos deputados", "tse"];
const POR_CANDIDATO = 3, JANELA_HORAS = 48, DIAS_NO_FEED = 7, UFS = ["rs", "sc"];
const iso = (d) => d.toISOString().replace(/\.\d+Z$/, "Z");
const texto = (s) => (s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).trim();
const campo = (bloco, tag) => { const m = bloco.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">")); return m ? texto(m[1]) : ""; };

const itensRss = (xml, tagFonte) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
  const fonte = campo(m[1], tagFonte); let titulo = campo(m[1], "title");
  if (fonte && titulo.endsWith(" - " + fonte)) titulo = titulo.slice(0, -(fonte.length + 3));
  const pub = new Date(campo(m[1], "pubDate"));
  let link = campo(m[1], "link");
  try { const u = new URL(link); if (u.hostname.endsWith("bing.com") && u.searchParams.get("url")) link = u.searchParams.get("url"); } catch (e) {}
  return { titulo, link, fonte, pub: isNaN(pub) ? null : pub };
});
// Bing Notícias primeiro, porque o Google Notícias não responde a chamadas vindas do Worker; o Google fica de reserva.
async function rss(consulta) {
  try { return itensRss(await baixar("https://www.bing.com/news/search?" + new URLSearchParams({ q: consulta, format: "rss", setlang: "pt-br", cc: "BR", qft: 'interval="7"' })), "News:Source"); }
  catch (e1) {
    try { return itensRss(await baixar("https://news.google.com/rss/search?" + new URLSearchParams({ q: consulta + " when:2d", hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" })), "source"); }
    catch (e2) { throw new Error("bing: " + String(e1).slice(0, 60) + " / google: " + String(e2).slice(0, 60)); }
  }
}

// ---------- banco (D1) ----------
const cfgGet = async (env, chave) => { const r = await env.DB.prepare("SELECT valor FROM config WHERE chave = ?").bind(chave).first(); return r ? JSON.parse(r.valor) : null; };
const cfgSet = (env, chave, valor) => env.DB.prepare("INSERT INTO config (chave, valor, atualizado) VALUES (?1, ?2, ?3) ON CONFLICT(chave) DO UPDATE SET valor = ?2, atualizado = ?3").bind(chave, JSON.stringify(valor), iso(new Date())).run();
const INSERE = "INSERT OR IGNORE INTO noticias (uf, cand, titulo, url, fonte, resumo, publicado, coletado, rodada, destaque) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

async function coletar(env, origem) {
  const agora = new Date(), rodada = iso(agora), limite = new Date(agora - JANELA_HORAS * 36e5), corte = iso(new Date(agora - DIAS_NO_FEED * 864e5));
  const buscas = new Map(), resumo = {}, listas = {};
  for (const uf of UFS) listas[uf] = await (await env.ASSETS.fetch(new Request(origem + "/" + uf + "/candidatos.json"))).json();
  const unicas = [...new Set(UFS.flatMap((uf) => listas[uf].map((c) => c.busca)))];
  await Promise.all(unicas.map(async (b) => { try { buscas.set(b, await rss(b)); } catch (e) { buscas.set(b, e); } }));
  for (const uf of UFS) {
    const ja = (await env.DB.prepare("SELECT url, cand, titulo FROM noticias WHERE uf = ?").bind(uf).all()).results;
    const urls = new Set(ja.map((i) => i.url)), titulos = new Set(ja.map((i) => i.cand + "|" + i.titulo.toLowerCase()));
    const novas = [], falhas = [];
    for (const c of listas[uf]) {
      const lista = buscas.get(c.busca);
      if (!Array.isArray(lista)) { falhas.push(c.id + ": " + String((lista && lista.message) || lista)); continue; }
      const nome = c.nome.toLowerCase(), sobrenome = nome.split(/\s+/).pop();
      let n = 0;
      for (const it of lista) {
        if (n >= POR_CANDIDATO) break;
        const t = it.titulo.toLowerCase();
        if (!it.link || urls.has(it.link) || titulos.has(c.id + "|" + t)) continue;
        if (!FONTES.some((f) => it.fonte.toLowerCase().includes(f))) continue;
        if (!it.pub || it.pub < limite) continue;
        if (!t.includes(sobrenome) && !t.includes(nome)) continue; // o título precisa citar o candidato
        novas.push(env.DB.prepare(INSERE).bind(uf, c.id, it.titulo, it.link, it.fonte, null, iso(it.pub), rodada, rodada, 0));
        urls.add(it.link); titulos.add(c.id + "|" + t); n++;
      }
    }
    if (novas.length) await env.DB.batch(novas);
    await env.DB.prepare("DELETE FROM noticias WHERE uf = ? AND destaque = 0 AND coletado < ?").bind(uf, corte).run();
    await cfgSet(env, "noticias:" + uf, { ultimaRodada: rodada, novosNaUltima: novas.length });
    resumo[uf] = { novos: novas.length, falhas };
  }
  const tudoFalhou = UFS.every((uf) => resumo[uf].falhas.length && !resumo[uf].novos);
  await cfgSet(env, "noticias:ultima", tudoFalhou ? iso(new Date(agora - 49 * 60000)) : rodada);
  return { rodada, ...resumo };
}

// Carga inicial: copia para o banco, em fatias, o noticias.json que está no repositório.
async function semear(env, origem, uf, de) {
  const itens = (await (await env.ASSETS.fetch(new Request(origem + "/" + uf + "/noticias.json"))).json()).itens || [];
  const fatia = itens.slice(de, de + 250);
  for (let i = 0; i < fatia.length; i += 50) await env.DB.batch(fatia.slice(i, i + 50).map((n) => env.DB.prepare(INSERE).bind(uf, n.cand, n.titulo, n.url, n.fonte || null, n.resumo || null, n.publicado || null, n.coletado || iso(new Date()), n.rodada || null, n.destaque ? 1 : 0)));
  return { uf, total: itens.length, de, ate: de + fatia.length, proximo: de + fatia.length < itens.length ? de + fatia.length : null };
}

const json = (corpo, maxAge = 0, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": maxAge ? "public, max-age=" + maxAge : "no-store" } });

function simulada() {
  const s = Math.floor(Date.now() / 60000) % 100, a = 50 + Math.sin(s / 7) * 2, f = (x) => x.toFixed(2).replace(".", ",");
  const par = (x, n) => ({ 22: { v: Math.round(n * x / 100), p: f(x), st: "" }, 13: { v: Math.round(n * (100 - x) / 100), p: f(100 - x), st: "" } });
  return { resultado: { simulado: true, eleicao: "teste", atualizado: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(",", ""), secoes: f(s), br: par(a, 1.2e6 * s), rs: par(a + 8, 6e4 * s), sc: par(a + 18, 4e4 * s), totais: { abstencao: "20,00", brancos: "2,00", nulos: "3,00" } } };
}

export default {
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(coletar(env, "https://assets.local"));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cache = caches.default;
    if (url.pathname === "/api/apuracao") {
      if (url.searchParams.get("teste")) return json(simulada());
      const ele = (url.searchParams.get("eleicao") || "").replace(/\D/g, "");
      const chave = new Request(url.origin + "/api/apuracao" + (ele ? "?eleicao=" + ele : ""));
      let resp = await cache.match(chave);
      if (!resp) {
        let corpo;
        try { corpo = await apuracao(ele); } catch (e) { corpo = { resultado: null, motivo: String(e) }; }
        resp = json(corpo, 60);
        ctx.waitUntil(cache.put(chave, resp.clone()));
      }
      return resp;
    }
    if (url.pathname === "/api/noticias/atualizar") {
      const ultima = await cfgGet(env, "noticias:ultima");
      if (ultima && Date.now() - new Date(ultima).getTime() < 50 * 60000) return json({ feito: false, motivo: "a última coleta foi há menos de 50 minutos", ultima });
      try { return json({ feito: true, ...(await coletar(env, url.origin)) }); } catch (e) { return json({ feito: false, motivo: String(e) }, 0, 500); }
    }
    if (url.pathname === "/api/admin/semear") {
      // só funciona enquanto a carga inicial não terminou; depois disso a rota se fecha sozinha
      if (await cfgGet(env, "semeado")) return json({ feito: false, motivo: "a carga inicial já foi concluída" });
      const uf = url.searchParams.get("uf"), de = Math.max(0, parseInt(url.searchParams.get("de") || "0", 10) || 0);
      if (!UFS.includes(uf)) return json({ erro: "informe uf=rs ou uf=sc" }, 0, 400);
      const r = await semear(env, url.origin, uf, de);
      if (r.proximo === null && uf === UFS[UFS.length - 1]) await cfgSet(env, "semeado", iso(new Date()));
      return json({ feito: true, ...r });
    }
    const m = url.pathname.match(/^\/api\/noticias\/([a-z]{2})$/);
    if (m && UFS.includes(m[1])) {
      const chave = new Request(url.origin + url.pathname);
      let resp = await cache.match(chave);
      if (!resp) {
        const corte = iso(new Date(Date.now() - DIAS_NO_FEED * 864e5));
        const linhas = (await env.DB.prepare("SELECT cand, titulo, url, fonte, resumo, publicado, coletado, rodada, destaque FROM noticias WHERE uf = ?1 AND (destaque = 1 OR coletado >= ?2)").bind(m[1], corte).all()).results;
        const itens = linhas.map((n) => { const o = { cand: n.cand, titulo: texto(n.titulo), url: n.url, fonte: texto(n.fonte), publicado: n.publicado, coletado: n.coletado, rodada: n.rodada }; if (n.resumo) o.resumo = n.resumo; if (n.destaque) o.destaque = true; return o; });
        resp = json({ meta: await cfgGet(env, "noticias:" + m[1]), completo: !!(await cfgGet(env, "semeado")), itens }, 300);
        ctx.waitUntil(cache.put(chave, resp.clone()));
      }
      return resp;
    }
    if (url.pathname === "/api/segundo-turno") {
      const chave = new Request(url.origin + url.pathname);
      let resp = await cache.match(chave);
      if (!resp) {
        const t2 = await cfgGet(env, "segundo-turno");
        if (!t2) return env.ASSETS.fetch(new Request(url.origin + "/segundo-turno.json"));
        resp = json(t2, 120);
        ctx.waitUntil(cache.put(chave, resp.clone()));
      }
      return resp;
    }
    if (url.pathname.startsWith("/api/")) return json({ erro: "rota não encontrada" }, 0, 404);
    return env.ASSETS.fetch(request);
  },
};
