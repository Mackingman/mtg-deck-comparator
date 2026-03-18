addEventListener(“fetch”, function(event) {
event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
var allow = {
“Access-Control-Allow-Origin”: “*”,
“Access-Control-Allow-Methods”: “GET, POST, OPTIONS”,
“Access-Control-Allow-Headers”: “Content-Type”
};

if (request.method === “OPTIONS”) {
return new Response(null, { status: 204, headers: allow });
}

var url = new URL(request.url);
var path = url.pathname;

try {
if (path === “/find-my-combos” || path === “/find-my-combos/”) {
return await findMyCombos(request, allow);
}
if (path === “/variants” || path === “/variants/”) {
return await getVariants(url, allow);
}
return new Response(“Routes: /find-my-combos  /variants”, {
status: 200,
headers: allow
});
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), {
status: 500,
headers: Object.assign({ “Content-Type”: “application/json” }, allow)
});
}
}

async function findMyCombos(request, allow) {
var body = await request.text();
var upstream = await fetch(
“https://backend.commanderspellbook.com/find-my-combos/”,
{
method: “GET”,
headers: { “Content-Type”: “application/json” },
body: body
}
);
var text = await upstream.text();
return new Response(text, {
status: upstream.status,
headers: Object.assign({
“Content-Type”: “application/json”,
“Cache-Control”: “public, max-age=300”
}, allow)
});
}

async function getVariants(url, allow) {
var upstream = await fetch(
“https://backend.commanderspellbook.com/variants/” + url.search,
{ method: “GET”, headers: { “Content-Type”: “application/json” } }
);
var text = await upstream.text();
return new Response(text, {
status: upstream.status,
headers: Object.assign({
“Content-Type”: “application/json”,
“Cache-Control”: “public, max-age=300”
}, allow)
});
}
