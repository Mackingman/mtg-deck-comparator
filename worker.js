export default {
  async fetch(request, env) {
    const allow = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: allow });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/find-my-combos" || path === "/find-my-combos/") {
        return await findMyCombos(request, allow);
      }
      if (path === "/variants" || path === "/variants/") {
        return await getVariants(url, allow);
      }
      if (path === "/edhrec") {
        return await getEdhrec(url, allow);
      }
      if (path === "/claude") {
        return await callClaude(request, allow, env);
      }
      return new Response("OK", { status: 200, headers: allow });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...allow, "Content-Type": "application/json" }
      });
    }
  }
};

async function findMyCombos(request, allow) {
  const body = await request.json();
  const cards = (body.card_list || "").split("\n").map(c => c.trim()).filter(Boolean);
  if (!cards.length) return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { ...allow, "Content-Type": "application/json" } });

  const cardSet = new Set(cards.map(c => c.toLowerCase()));
  const allCombos = [];
  const seenKeys = new Set();

  for (const card of cards.slice(0, 10)) {
    try {
      const q = encodeURIComponent(`card="${card}" legal:commander`);
      const res = await fetch(`https://backend.commanderspellbook.com/variants/?q=${q}&limit=100&format=json`);
      if (!res.ok) continue;
      const data = await res.json();
      for (const v of (data.results || [])) {
        const comboCards = (v.uses || []).map(u => (u.card && u.card.name) || (u.template && u.template.name) || "").filter(Boolean);
        if (comboCards.length < 2) continue;
        if (!comboCards.every(c => cardSet.has(c.toLowerCase()))) continue;
        const key = [...comboCards].sort().join("|");
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        allCombos.push(v);
      }
    } catch(e) { continue; }
  }
  return new Response(JSON.stringify({ results: allCombos }), { status: 200, headers: { ...allow, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
}

async function getVariants(url, allow) {
  const res = await fetch("https://backend.commanderspellbook.com/variants/" + url.search);
  return new Response(await res.text(), { status: res.status, headers: { ...allow, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
}

async function getEdhrec(url, allow) {
  const params = new URL("https://x.com" + url.search);
  const commander = params.get("commander") || "";
  if (!commander) return new Response(JSON.stringify({ error: "No commander" }), { status: 400, headers: { ...allow, "Content-Type": "application/json" } });

  const res = await fetch(`https://json.edhrec.com/pages/commanders/${commander}.json`, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
  });
  if (!res.ok) return new Response(JSON.stringify({ error: "Not found", status: res.status }), { status: 404, headers: { ...allow, "Content-Type": "application/json" } });

  const data = await res.json();
  const cards = [];
  const cardLists = (data.container && data.container.json_dict && data.container.json_dict.cardlists) || [];
  for (const list of cardLists) {
    for (const c of (list.cardviews || [])) {
      if (c.name) cards.push({ name: c.name, inclusion: c.inclusion || 0, synergy: c.synergy || 0, label: list.header || "" });
    }
  }
  cards.sort((a, b) => (b.synergy || 0) - (a.synergy || 0));
  return new Response(JSON.stringify({ commander, cards: cards.slice(0, 50) }), { status: 200, headers: { ...allow, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } });
}

async function callClaude(request, allow, env) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "API key not configured" }), { status: 401, headers: { ...allow, "Content-Type": "application/json" } });

  const body = await request.json();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: body.messages || []
    })
  });
  return new Response(await res.text(), { status: res.status, headers: { ...allow, "Content-Type": "application/json" } });
}
