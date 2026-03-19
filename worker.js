addEventListener("fetch", function(event) {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  var allow = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: allow });
  }

  var url = new URL(request.url);
  var path = url.pathname;

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
      return await callClaude(request, allow);
    }
    return new Response("OK", { status: 200, headers: allow });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: Object.assign({ "Content-Type": "application/json" }, allow)
    });
  }
}

async function findMyCombos(request, allow) {
  var body = await request.json();
  var cardList = body.card_list || "";
  var cards = cardList.split("\n").map(function(c) { return c.trim(); }).filter(Boolean);

  if (cards.length === 0) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: Object.assign({ "Content-Type": "application/json" }, allow)
    });
  }

  var cardSet = new Set(cards.map(function(c) { return c.toLowerCase(); }));
  var allCombos = [];
  var seenKeys = new Set();
  var toQuery = cards.slice(0, 10);

  for (var i = 0; i < toQuery.length; i++) {
    var card = toQuery[i];
    try {
      var q = encodeURIComponent('card="' + card + '" legal:commander');
      var upstream = await fetch(
        "https://backend.commanderspellbook.com/variants/?q=" + q + "&limit=100&format=json"
      );
      if (!upstream.ok) continue;
      var data = await upstream.json();
      var variants = data.results || [];

      for (var j = 0; j < variants.length; j++) {
        var v = variants[j];
        var uses = v.uses || [];
        var comboCards = [];
        for (var k = 0; k < uses.length; k++) {
          var u = uses[k];
          var name = (u.card && u.card.name) || (u.template && u.template.name) || u.name || "";
          if (name) comboCards.push(name);
        }
        if (comboCards.length < 2) continue;
        var allPresent = comboCards.every(function(c) {
          return cardSet.has(c.toLowerCase());
        });
        if (!allPresent) continue;
        var key = comboCards.slice().sort().join("|");
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        allCombos.push(v);
      }
    } catch(e) {
      continue;
    }
  }

  return new Response(JSON.stringify({ results: allCombos }), {
    status: 200,
    headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "public, max-age=300" }, allow)
  });
}

async function getVariants(url, allow) {
  var upstream = await fetch(
    "https://backend.commanderspellbook.com/variants/" + url.search,
    { method: "GET", headers: { "Content-Type": "application/json" } }
  );
  var text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "public, max-age=300" }, allow)
  });
}

async function getEdhrec(url, allow) {
  var params = new URL("https://x.com" + url.search);
  var commander = params.get("commander") || "";
  if (!commander) {
    return new Response(JSON.stringify({ error: "No commander specified" }), {
      status: 400, headers: Object.assign({ "Content-Type": "application/json" }, allow)
    });
  }

  var edhrecUrl = "https://json.edhrec.com/pages/commanders/" + commander + ".json";
  var upstream = await fetch(edhrecUrl, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
  });

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: "Commander not found", status: upstream.status }), {
      status: 404, headers: Object.assign({ "Content-Type": "application/json" }, allow)
    });
  }

  var data = await upstream.json();
  var cards = [];
  var container = data.container || {};
  var cardLists = (container.json_dict && container.json_dict.cardlists) || [];

  for (var i = 0; i < cardLists.length; i++) {
    var list = cardLists[i];
    var cardviews = list.cardviews || [];
    for (var j = 0; j < cardviews.length; j++) {
      var c = cardviews[j];
      if (c.name) {
        cards.push({
          name: c.name,
          inclusion: c.inclusion || 0,
          synergy: c.synergy || 0,
          label: list.header || ""
        });
      }
    }
  }

  cards.sort(function(a, b) { return (b.synergy || 0) - (a.synergy || 0); });

  return new Response(JSON.stringify({ commander: commander, cards: cards.slice(0, 50) }), {
    status: 200,
    headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" }, allow)
  });
}

async function callClaude(request, allow) {
  var body = await request.json();

  var upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": body.apiKey || "",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: body.messages || []
    })
  });

  var text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: Object.assign({ "Content-Type": "application/json" }, allow)
  });
}
