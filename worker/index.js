// Worker do site: os arquivos estáticos saem direto do repositório (binding ASSETS).
// Rotas com código:
//   /api/apuracao             apuração do 2º turno para presidente (país, RS e SC), lida no TSE e guardada por 1 minuto
//   /api/apuracao?teste=1     números inventados, para ensaiar a tela
//   /api/noticias/<uf>        notícias coletadas pelo próprio Worker (KV), guardadas por 5 minutos
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

async function coletar(env, origem) {
  const agora = new Date(), rodada = iso(agora), limite = new Date(agora - JANELA_HORAS * 36e5), corte = iso(new Date(agora - DIAS_NO_FEED * 864e5));
  const buscas = new Map(), resumo = {};
  const listas = {};
  for (const uf of UFS) listas[uf] = await (await env.ASSETS.fetch(new Request(origem + "/" + uf + "/candidatos.json"))).json();
  const unicas = [...new Set(UFS.flatMap((uf) => listas[uf].map((c) => c.busca)))];
  await Promise.all(unicas.map(async (b) => { try { buscas.set(b, await rss(b)); } catch (e) { buscas.set(b, e); } }));
  for (const uf of UFS) {
    const arq = async (nome) => (await env.ASSETS.fetch(new Request(origem + "/" + uf + "/" + nome))).json();
    const cands = listas[uf];
    const guardado = (await env.DADOS.get("noticias:" + uf, "json")) || { itens: [] };
    // o arquivo do repositório entra só para não repetir o que já está publicado nele
    let base = []; try { base = (await arq("noticias.json")).itens || []; } catch (e) {}
    const urls = new Set([...base, ...guardado.itens].map((i) => i.url));
    const titulos = new Set([...base, ...guardado.itens].map((i) => i.cand + "|" + i.titulo.toLowerCase()));
    const itens = guardado.itens.filter((i) => String(i.coletado || "") >= corte);
    let novos = 0; const falhas = [];
    for (const c of cands) {
      let lista;
      lista = buscas.get(c.busca);
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
        itens.push({ cand: c.id, titulo: it.titulo, url: it.link, fonte: it.fonte, publicado: iso(it.pub), coletado: rodada, rodada });
        urls.add(it.link); titulos.add(c.id + "|" + t); n++; novos++;
      }
    }
    await env.DADOS.put("noticias:" + uf, JSON.stringify({ meta: { ultimaRodada: rodada, novosNaUltima: novos }, itens }));
    resumo[uf] = { novos, guardados: itens.length, falhas };
  }
  // se todas as buscas falharam, não trava a próxima tentativa manual
  if (UFS.some((uf) => resumo[uf].falhas.length === 0 || resumo[uf].novos > 0)) await env.DADOS.put("noticias:ultima2", rodada);
  else await env.DADOS.put("noticias:ultima2", iso(new Date(agora - 49 * 60000)));
  return { rodada, ...resumo };
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
      const ultima = await env.DADOS.get("noticias:ultima2");
      if (ultima && Date.now() - new Date(ultima).getTime() < 50 * 60000) return json({ feito: false, motivo: "a última coleta foi há menos de 50 minutos", ultima });
      try { return json({ feito: true, ...(await coletar(env, url.origin)) }); } catch (e) { return json({ feito: false, motivo: String(e) }, 0, 500); }
    }
    const m = url.pathname.match(/^\/api\/noticias\/([a-z]{2})$/);
    if (m && UFS.includes(m[1])) {
      const chave = new Request(url.origin + url.pathname);
      let resp = await cache.match(chave);
      if (!resp) {
        const dados = (await env.DADOS.get("noticias:" + m[1], "json")) || { meta: null, itens: [] };
        dados.itens = dados.itens.map((i) => ({ ...i, titulo: texto(i.titulo), fonte: texto(i.fonte) }));
        resp = json(dados, 300);
        ctx.waitUntil(cache.put(chave, resp.clone()));
      }
      return resp;
    }
    if (url.pathname.startsWith("/api/")) return json({ erro: "rota não encontrada" }, 0, 404);
    return env.ASSETS.fetch(request);
  },
};
