// Public, read-only. Returns only the PUBLISHED content (hidden items were removed at publish time).
// If anything fails, it returns {} and the website falls back to the content built into index.html.
export async function onRequestGet({ env }) {
  const h = { "content-type": "application/json", "cache-control": "public, max-age=30" };
  try {
    const r = await env.DB.prepare("SELECT published FROM content WHERE id='site'").first();
    return new Response(r && r.published ? r.published : "{}", { headers: h });
  } catch (e) {
    return new Response("{}", { headers: { "content-type": "application/json" } });
  }
}
