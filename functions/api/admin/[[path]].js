// Arlow admin API. Nothing secret lives in this file:
//   ADMIN_PASSWORD and SESSION_SECRET are Cloudflare "Secrets"; DB is a D1 binding (see setup guide).
const enc = new TextEncoder();
class V extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const J = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store", ...h } });
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hmac = async (k, d) => b64u(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", enc.encode(k), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), enc.encode(d)));
async function same(a, b, k) { const x = await hmac(k, a), y = await hmac(k, b); let d = 0; for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i); return d === 0; } // constant-time compare
const MAX_IMG = 300 * 1024, MAX_IMAGES = 200, MAX_JSON = 600 * 1024;

/* ---------- sessions & login ---------- */
async function authed(req, env) {
  const m = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)arlow_s=(\d+)\.([\w-]+)/);
  if (!m || +m[1] < Date.now()) return false;
  return same(m[2], await hmac(env.SESSION_SECRET, "s." + m[1]), env.SESSION_SECRET);
}
async function login(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "?", now = Date.now();
  let a = await env.DB.prepare("SELECT n,t FROM attempts WHERE ip=?").bind(ip).first();
  if (a && now - a.t > 9e5) a = null;                       // 15-minute window
  if (a && a.n >= 5) throw new V("Too many attempts. Try again in 15 minutes.", 429);
  const { password } = await req.json().catch(() => ({}));
  if (typeof password === "string" && await same(password, env.ADMIN_PASSWORD, env.SESSION_SECRET)) {
    await env.DB.prepare("DELETE FROM attempts WHERE ip=?").bind(ip).run();
    const exp = now + 12 * 3600e3;
    return J({ ok: true }, 200, { "set-cookie": `arlow_s=${exp}.${await hmac(env.SESSION_SECRET, "s." + exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200` });
  }
  await env.DB.prepare("INSERT INTO attempts(ip,n,t) VALUES(?,1,?) ON CONFLICT(ip) DO UPDATE SET n=?, t=?").bind(ip, now, (a ? a.n : 0) + 1, a ? a.t : now).run();
  await new Promise(r => setTimeout(r, 500));
  throw new V("Incorrect password.", 401);
}

/* ---------- validation: the server never trusts the browser ---------- */
const rid = () => [...crypto.getRandomValues(new Uint8Array(6))].map(x => x.toString(16).padStart(2, "0")).join("");
const S = (v, n) => String(v == null ? "" : v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim().slice(0, n);
const U = v => { v = S(v, 500); if (!v) return ""; try { const u = new URL(v); if (!/^https?:$/.test(u.protocol)) throw 0; return u.href; } catch { throw new V("Invalid link (must start with https://): " + v.slice(0, 60)); } };
const I = v => { v = S(v, 500); return !v || /^\/img\/[a-f0-9]{12}$/.test(v) ? v : U(v); };
const L = v => (Array.isArray(v) ? v : String(v || "").split("\n")).map(x => S(x, 120)).filter(Boolean).slice(0, 12);
const N = v => { if (v === "" || v == null) return null; const n = Number(v); if (!isFinite(n) || n < 0 || n > 1e12) throw new V("Numbers must be 0 or more."); return n; };
const SP = {
  projects: [200, { title: ["s", 120], category: ["s", 40], video: ["u"], url: ["u"], thumb: ["i"], desc: ["s", 500] }],
  thumbnails: [200, { title: ["s", 120], desc: ["s", 300], src: ["i"] }],
  socials: [20, { platform: ["s", 40], username: ["s", 60], url: ["u"], followers: ["s", 20], views: ["s", 20], videos: ["s", 20], icon: ["i"] }],
  services: [20, { name: ["s", 80], desc: ["s", 600], price: ["s", 60], features: ["l"], example: ["s", 20], status: ["s", 20] }],
  episodes: [100, { title: ["s", 120], desc: ["s", 400], video: ["u"], url: ["u"], thumb: ["i"] }],
  news: [100, { title: ["s", 120], body: ["s", 800], date: ["s", 20] }]
};
const coll = (arr, k) => {
  const [max, f] = SP[k];
  return (Array.isArray(arr) ? arr : []).slice(0, max).map(o => {
    o = o || {};
    const r = { id: typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : rid(), hidden: o.hidden === true };
    for (const [n, [t, l]] of Object.entries(f)) r[n] = t === "s" ? S(o[n], l) : t === "u" ? U(o[n]) : t === "i" ? I(o[n]) : L(o[n]);
    return r;
  });
};
function clean(c) {
  c = c || {}; const a = c.auralis || {}, g = c.growth || {};
  const labels = (Array.isArray(g.labels) ? g.labels : []).slice(0, 24).map(x => S(x, 12));
  let vals = Array.isArray(g.values) && g.values.length ? g.values.slice(0, 24).map(N) : null;
  if (vals && (vals.includes(null) || vals.length !== labels.length)) throw new V("Growth chart: every month needs a label and a number.");
  return {
    projects: coll(c.projects, "projects"), thumbnails: coll(c.thumbnails, "thumbnails"), socials: coll(c.socials, "socials"), services: coll(c.services, "services"),
    featuredId: S(c.featuredId, 40), accepting: c.accepting !== false, availability: S(c.availability, 200),
    config: { discordInvite: U((c.config || {}).discordInvite) },
    auralis: { trailerUrl: U(a.trailerUrl), lore: S(a.lore, 1500), recruitment: S(a.recruitment, 800), recruitStatus: S(a.recruitStatus, 30), recruitUrl: U(a.recruitUrl), discordInvite: U(a.discordInvite), episodes: coll(a.episodes, "episodes"), news: coll(a.news, "news") },
    growth: { labels: vals ? labels : [], values: vals },
    goals: (Array.isArray(c.goals) ? c.goals : []).slice(0, 6).map(x => ({ label: S(x && x.label, 40), current: N(x && x.current), target: N(x && x.target) })).filter(x => x.label)
  };
}
const vis = a => a.filter(x => !x.hidden);
const strip = c => ({ ...c, projects: vis(c.projects), thumbnails: vis(c.thumbnails), socials: vis(c.socials), services: vis(c.services), auralis: { ...c.auralis, episodes: vis(c.auralis.episodes), news: vis(c.auralis.news) } });

/* ---------- change log & housekeeping ---------- */
function summ(a, b) {
  const o = [];
  for (const k of ["projects", "thumbnails", "socials", "services"]) {
    const x = new Map(((a && a[k]) || []).map(i => [i.id, JSON.stringify(i)])), y = b[k] || [];
    let add = 0, chg = 0;
    y.forEach(i => { if (!x.has(i.id)) add++; else if (x.get(i.id) !== JSON.stringify(i)) chg++; });
    const rem = [...x.keys()].filter(id => !y.some(i => i.id === id)).length;
    if (add || chg || rem) o.push(`${k}: ${add} added, ${chg} edited, ${rem} removed/hidden`);
  }
  for (const k of ["auralis", "growth", "goals", "accepting", "availability", "featuredId", "config"]) if (JSON.stringify(a && a[k]) !== JSON.stringify(b[k])) o.push(k + " updated");
  return o.join("; ") || "No visible changes";
}
async function log(env, action, detail) {
  await env.DB.prepare("INSERT INTO changes(at,action,detail) VALUES(?,?,?)").bind(new Date().toISOString(), action, detail || "").run();
  await env.DB.prepare("DELETE FROM changes WHERE id <= (SELECT id FROM changes ORDER BY id DESC LIMIT 1 OFFSET 200)").run();
}
async function gc(env) { // delete uploaded images no longer used by the draft or the live site (ignores images under 1 hour old)
  const r = await env.DB.prepare("SELECT draft, published FROM content WHERE id='site'").first() || {};
  const used = new Set(((r.draft || "") + (r.published || "")).match(/\/img\/[a-f0-9]{12}/g)?.map(x => x.slice(5)) || []);
  const rows = (await env.DB.prepare("SELECT id FROM images WHERE created_at<?").bind(Date.now() - 3600e3).all()).results || [];
  const del = rows.filter(x => !used.has(x.id));
  if (del.length) await env.DB.batch(del.map(x => env.DB.prepare("DELETE FROM images WHERE id=?").bind(x.id)));
}
const toB64 = u => { let s = ""; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
function sniff(u) {
  if (u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF) return "image/jpeg";
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4E && u[3] === 0x47) return "image/png";
  if (u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) return "image/webp";
  return "";
}

/* ---------- router ---------- */
export async function onRequest({ request, env, params }) {
  const url = new URL(request.url), p = [].concat(params.path || []).join("/"), m = request.method;
  try {
    if (!env.DB || !env.ADMIN_PASSWORD || (env.SESSION_SECRET || "").length < 32 || env.ADMIN_PASSWORD.length < 12)
      return J({ error: "Server not configured yet. Follow the setup guide: D1 binding named DB, plus the ADMIN_PASSWORD (12+ characters) and SESSION_SECRET (32+ characters) secrets." }, 503);
    if (m !== "GET") { // CSRF defence on top of SameSite=Strict cookies
      const o = request.headers.get("Origin");
      if ((o && o !== url.origin) || request.headers.get("X-Admin") !== "1") throw new V("Forbidden", 403);
    }
    if (p === "login" && m === "POST") return await login(request, env);
    if (p === "logout" && m === "POST") return J({ ok: true }, 200, { "set-cookie": "arlow_s=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
    if (!(await authed(request, env))) throw new V("Please log in.", 401);   // everything below needs a valid session
    const DB = env.DB;

    if (p === "me") return J({ ok: true });
    if (p === "content" && m === "GET") {
      const r = await DB.prepare("SELECT * FROM content WHERE id='site'").first() || {};
      const d = r.draft ? JSON.parse(r.draft) : null;
      return J({ draft: d, hasPublished: !!r.published, draftAt: r.draft_at || null, publishedAt: r.published_at || null, dirty: !!d && JSON.stringify(strip(d)) !== r.published });
    }
    if ((p === "content" && m === "PUT") || (p === "import" && m === "POST")) {
      if (+(request.headers.get("content-length") || 0) > MAX_JSON) throw new V("Content too large.", 413);
      const body = await request.json().catch(() => { throw new V("Invalid JSON."); });
      const c = clean(p === "import" ? body.content : body), ts = new Date().toISOString();
      await DB.prepare("INSERT INTO content(id,draft,draft_at) VALUES('site',?,?) ON CONFLICT(id) DO UPDATE SET draft=excluded.draft, draft_at=excluded.draft_at").bind(JSON.stringify(c), ts).run();
      if (p === "import") await log(env, "Imported", "Copied the built-in site content into the draft");
      return J({ ok: true, draft: c, draftAt: ts });
    }
    if (p === "publish" && m === "POST") {
      const r = await DB.prepare("SELECT draft, published FROM content WHERE id='site'").first();
      if (!r || !r.draft) throw new V("Nothing to publish. Save a draft first.");
      const pub = strip(JSON.parse(r.draft)), ts = new Date().toISOString();
      await DB.prepare("UPDATE content SET published=?, published_at=? WHERE id='site'").bind(JSON.stringify(pub), ts).run();
      await log(env, "Published", summ(r.published ? JSON.parse(r.published) : null, pub));
      await gc(env);
      return J({ ok: true, publishedAt: ts });
    }
    if (p === "upload" && m === "POST") {
      if (+(request.headers.get("content-length") || 0) > MAX_IMG) throw new V("Image is over 300 KB after compression. Use a smaller image.", 413);
      const u = new Uint8Array(await request.arrayBuffer());
      if (!u.length || u.length > MAX_IMG) throw new V("Image must be under 300 KB.", 413);
      const mime = sniff(u); if (!mime) throw new V("Only JPG, PNG or WebP images are allowed.");
      const cnt = await DB.prepare("SELECT COUNT(*) c FROM images").first();
      if (cnt.c >= MAX_IMAGES) throw new V(`Image limit reached (${MAX_IMAGES}). Delete unused images and publish to free space.`);
      const id = rid();
      await DB.prepare("INSERT INTO images(id,mime,size,data,created_at) VALUES(?,?,?,?,?)").bind(id, mime, u.length, toB64(u), Date.now()).run();
      await log(env, "Image uploaded", Math.round(u.length / 1024) + " KB");
      return J({ ok: true, src: "/img/" + id });
    }
    if (p === "log" && m === "GET") return J({ rows: (await DB.prepare("SELECT at, action, detail FROM changes ORDER BY id DESC LIMIT 30").all()).results || [] });
    throw new V("Not found", 404);
  } catch (e) {
    if (!(e instanceof V)) console.error(e);
    return J({ error: e instanceof V ? e.message : "Server error. Check that the database tables were created (see setup guide)." }, e instanceof V ? e.status : 500);
  }
}
