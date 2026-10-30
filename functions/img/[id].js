// Serves an uploaded image stored in D1 (base64 text). IDs are random 12-character hex strings.
export async function onRequestGet({ env, params }) {
  const id = String(params.id);
  if (!/^[a-f0-9]{12}$/.test(id)) return new Response("Not found", { status: 404 });
  const r = await env.DB.prepare("SELECT mime, data FROM images WHERE id=?").bind(id).first();
  if (!r) return new Response("Not found", { status: 404 });
  const bin = atob(r.data), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Response(u, {
    headers: { "content-type": r.mime, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" }
  });
}
