// Worker do site: os arquivos estáticos saem direto do repositório (binding ASSETS).
// A única rota com código é /api/apuracao, que busca no TSE a apuração do 2º turno
// para presidente (país, RS e SC) e guarda a resposta por um minuto.

const BASE = "https://resultados.tse.jus.br/oficial";
const DATA_2T = "25/10/2026";

const baixar = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (eleicoes-2026)" } });
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/apuracao") {
      const chave = new Request(url.origin + "/api/apuracao" + (url.searchParams.get("eleicao") ? "?eleicao=" + url.searchParams.get("eleicao") : ""));
      const cache = caches.default;
      let resp = await cache.match(chave);
      if (!resp) {
        let corpo;
        try { corpo = await apuracao((url.searchParams.get("eleicao") || "").replace(/\D/g, "")); }
        catch (e) { corpo = { resultado: null, motivo: String(e) }; }
        resp = new Response(JSON.stringify(corpo), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
        ctx.waitUntil(cache.put(chave, resp.clone()));
      }
      return resp;
    }
    if (url.pathname.startsWith("/api/")) return new Response("Não encontrado", { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
