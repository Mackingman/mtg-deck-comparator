// spellbook-proxy Cloudflare Worker
// Deploy at: spellbook-proxy.work-macarthur.workers.dev

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(msg, status = 500) {
  return json({ error: msg }, status);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ── /moxfield?id=DECKID ────────────────────────────────────────────────
    if (path === '/moxfield') {
      const deckId = url.searchParams.get('id');
      if (!deckId) return err('Missing id param', 400);

      try {
        const resp = await fetch(`https://api2.moxfield.com/v3/decks/all/${deckId}`, {
          headers: {
            'User-Agent': 'EDHPowerLevel/1.0 (edhpowerlevel.ca)',
            'Accept': 'application/json',
          },
        });

        if (!resp.ok) {
          return err(`Moxfield returned ${resp.status} — make sure the deck is set to Public`, resp.status);
        }

        const data = await resp.json();
        const deckName = data.name || 'Moxfield Deck';
        const lines = [];

        // Include commanders first, then mainboard
        for (const board of ['commanders', 'companions', 'mainboard']) {
          if (!data.boards?.[board]?.cards) continue;
          for (const [, entry] of Object.entries(data.boards[board].cards)) {
            const name = entry.card?.name;
            const qty = entry.quantity || 1;
            if (name) lines.push(`${qty} ${name}`);
          }
        }

        if (lines.length === 0) return err('No cards found — is this deck public?');

        return json({ name: deckName, list: lines.join('\n'), count: lines.length });

      } catch (e) {
        return err('Failed to fetch from Moxfield: ' + e.message);
      }
    }

    // ── /archidekt?id=DECKID ───────────────────────────────────────────────
    if (path === '/archidekt') {
      const deckId = url.searchParams.get('id');
      if (!deckId) return err('Missing id param', 400);

      try {
        const resp = await fetch(`https://archidekt.com/api/decks/${deckId}/small/`, {
          headers: {
            'User-Agent': 'EDHPowerLevel/1.0 (edhpowerlevel.ca)',
            'Accept': 'application/json',
          },
        });

        if (!resp.ok) {
          return err(`Archidekt returned ${resp.status} — make sure the deck is set to Public`, resp.status);
        }

        const data = await resp.json();
        const deckName = data.name || 'Archidekt Deck';
        const lines = [];

        for (const card of (data.cards || [])) {
          const cat = card.category || '';
          if (cat === 'Sideboard' || cat === 'Maybeboard') continue;
          const name = card.card?.oracleCard?.name || card.card?.name;
          const qty = card.quantity || 1;
          if (name) lines.push(`${qty} ${name}`);
        }

        if (lines.length === 0) return err('No cards found — is this deck public?');

        return json({ name: deckName, list: lines.join('\n'), count: lines.length });

      } catch (e) {
        return err('Failed to fetch from Archidekt: ' + e.message);
      }
    }

    // ── /find-my-combos  (Commander Spellbook) ─────────────────────────────
    if (path === '/find-my-combos') {
      if (request.method !== 'POST') return err('POST required', 405);
      try {
        const body = await request.json();
        const resp = await fetch('https://backend.commanderspellbook.com/find-my-combos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await resp.json();
        return json(data, resp.status);
      } catch (e) {
        return err('Spellbook error: ' + e.message);
      }
    }

    // ── /edhrec?commander=NAME ─────────────────────────────────────────────
    if (path === '/edhrec') {
      const commander = url.searchParams.get('commander');
      if (!commander) return err('Missing commander param', 400);
      try {
        const slug = commander.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const resp = await fetch(`https://json.edhrec.com/pages/commanders/${slug}.json`);
        if (!resp.ok) return err(`EDHREC returned ${resp.status}`, resp.status);
        const data = await resp.json();
        return json(data);
      } catch (e) {
        return err('EDHREC error: ' + e.message);
      }
    }

    // ── /claude  (Anthropic API proxy) ────────────────────────────────────
    if (path === '/claude') {
      if (request.method !== 'POST') return err('POST required', 405);
      try {
        const body = await request.text();
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body,
        });
        const data = await resp.json();
        return json(data, resp.status);
      } catch (e) {
        return err('Claude API error: ' + e.message);
      }
    }

    return new Response('EDH Power Level Proxy — unknown route: ' + path, {
      status: 404,
      headers: CORS,
    });
  },
};
