import PostalMime from "postal-mime";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function randomHex(bytes = 16) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return [...data].map(x => x.toString(16).padStart(2, "0")).join("");
}

function allowedDomains(env) {
  return String(env.ALLOWED_DOMAINS || "whtstore.my.id,shirochan.my.id,kingxjunz.my.id")
    .split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
}

function cleanLocalPart(value) {
  return String(value || "").trim().toLowerCase();
}

function validLocalPart(value) {
  return /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(value) &&
    !value.includes("..") && !value.startsWith(".") && !value.endsWith(".");
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "vary": "Origin"
  };
  if (origin && new URL(origin).hostname.endsWith("whtstore.my.id")) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

function responseWithCors(response, request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

async function parseBody(request) {
  try { return await request.json(); } catch { return {}; }
}

async function authenticateMailbox(env, address, token) {
  if (!address || !token) return null;
  return env.DB.prepare(
    "SELECT address, token, expires_at FROM mailboxes WHERE address = ? AND token = ? AND expires_at > ?"
  ).bind(address.toLowerCase(), token, Date.now()).first();
}

async function cleanupExpired(env) {
  const now = Date.now();
  await env.DB.prepare("DELETE FROM mailboxes WHERE expires_at <= ?").bind(now).run();
  await env.DB.prepare("DELETE FROM messages WHERE received_at < ?").bind(now - 7 * 24 * 60 * 60 * 1000).run();
}

async function createMailbox(request, env) {
  const body = await parseBody(request);
  const domain = String(body.domain || "").trim().toLowerCase();
  const mode = body.mode === "custom" ? "custom" : "random";
  const domains = allowedDomains(env);
  if (!domains.includes(domain)) return json({ error: "Domain is not allowed." }, 400);

  let local = "";
  if (mode === "custom") {
    local = cleanLocalPart(body.local);
    if (!validLocalPart(local)) {
      return json({ error: "Email username must be 1–64 characters using lowercase letters, numbers, dots, underscores, or hyphens." }, 400);
    }
  }

  // Client may choose only the supported expiration durations.
  const allowedTtlMinutes = [15, 60, 360, 720, 1440];
  const requestedTtl = Number(body.ttlMinutes);
  const ttlMinutes = allowedTtlMinutes.includes(requestedTtl)
    ? requestedTtl
    : Math.min(1440, Math.max(15, Number(env.MAIL_TTL_HOURS || 24) * 60));
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  const ttlHours = ttlMinutes / 60;

  for (let attempt = 0; attempt < 5; attempt++) {
    const localPart = mode === "custom" ? local : `wh${randomHex(5)}`;
    const address = `${localPart}@${domain}`;
    const token = randomHex(24);
    try {
      await env.DB.prepare(
        "INSERT INTO mailboxes (address, token, created_at, expires_at) VALUES (?, ?, ?, ?)"
      ).bind(address, token, Date.now(), expiresAt).run();
      return json({ address, token, expiresAt, ttlHours, ttlMinutes });
    } catch (error) {
      if (mode === "custom") return json({ error: "Address is already in use. Choose another username." }, 409);
    }
  }
  return json({ error: "Could not create address. Please try again." }, 500);
}

async function listMessages(request, env, address) {
  const url = new URL(request.url);
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("token");
  const mailbox = await authenticateMailbox(env, address, token);
  if (!mailbox) return json({ error: "Inbox tidak ditemukan, token salah, atau alamat sudah kedaluwarsa." }, 401);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  const result = await env.DB.prepare(
    "SELECT id, to_address, from_address, subject, text_body, html_body, received_at FROM messages WHERE to_address = ? ORDER BY received_at DESC LIMIT ?"
  ).bind(address.toLowerCase(), limit).all();
  return json({ address: mailbox.address, expiresAt: mailbox.expires_at, messages: result.results || [] });
}

async function getMessage(request, env, address, id) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const mailbox = await authenticateMailbox(env, address, token);
  if (!mailbox) return json({ error: "Inbox tidak ditemukan atau token salah." }, 401);
  const message = await env.DB.prepare(
    "SELECT id, to_address, from_address, subject, text_body, html_body, received_at FROM messages WHERE to_address = ? AND id = ?"
  ).bind(address.toLowerCase(), id).first();
  return message ? json({ message }) : json({ error: "Pesan tidak ditemukan." }, 404);
}

async function deleteMailbox(request, env, address) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const mailbox = await authenticateMailbox(env, address, token);
  if (!mailbox) return json({ error: "Inbox tidak ditemukan atau token salah." }, 401);
  await env.DB.prepare("DELETE FROM mailboxes WHERE address = ?").bind(address.toLowerCase()).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return responseWithCors(new Response(null, { status: 204 }), request);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    let response;

    try {
      if (path === "/api/health") {
        response = json({ ok: true, brand: "White Hosting ID", domains: allowedDomains(env) });
      } else if (path === "/api/domains" && request.method === "GET") {
        response = json({ domains: allowedDomains(env) });
      } else if (path === "/api/mailboxes" && request.method === "POST") {
        await cleanupExpired(env);
        response = await createMailbox(request, env);
      } else if (path.startsWith("/api/inbox/") && request.method === "GET") {
        const address = decodeURIComponent(path.slice("/api/inbox/".length));
        response = await listMessages(request, env, address);
      } else if (path.startsWith("/api/message/") && request.method === "GET") {
        const rest = path.slice("/api/message/".length);
        const slash = rest.lastIndexOf("/");
        if (slash < 1) response = json({ error: "Path pesan tidak valid." }, 400);
        else response = await getMessage(request, env, decodeURIComponent(rest.slice(0, slash)), decodeURIComponent(rest.slice(slash + 1)));
      } else if (path.startsWith("/api/mailboxes/") && request.method === "DELETE") {
        response = await deleteMailbox(request, env, decodeURIComponent(path.slice("/api/mailboxes/".length)));
      } else {
        response = await env.ASSETS.fetch(request);
      }
    } catch (error) {
      console.error("Request failed:", error);
      response = json({ error: "An internal server error occurred." }, 500);
    }
    return responseWithCors(response, request);
  },

  async email(message, env, ctx) {
    try {
      const recipient = String(message.to || "").trim().toLowerCase();
      const mailbox = await env.DB.prepare(
        "SELECT address FROM mailboxes WHERE address = ? AND expires_at > ?"
      ).bind(recipient, Date.now()).first();
      if (!mailbox) {
        message.setReject("Temporary mailbox does not exist or has expired.");
        return;
      }

      const parsed = await PostalMime.parse(message.raw);
      const id = randomHex(16);
      const from = parsed.from?.address || String(message.from || "unknown");
      const subject = String(parsed.subject || "(No subject)").slice(0, 500);
      const textBody = String(parsed.text || "").slice(0, 100000);
      const htmlBody = String(parsed.html || "").slice(0, 150000);
      const maxMessages = Math.min(100, Math.max(1, Number(env.MAX_MESSAGES_PER_INBOX || 50)));

      await env.DB.prepare(
        "INSERT INTO messages (id, to_address, from_address, subject, text_body, html_body, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, recipient, from, subject, textBody, htmlBody, Date.now()).run();

      await env.DB.prepare(
        "DELETE FROM messages WHERE id IN (SELECT id FROM messages WHERE to_address = ? ORDER BY received_at DESC LIMIT -1 OFFSET ?)"
      ).bind(recipient, maxMessages).run();
    } catch (error) {
      console.error("Email handler failed:", error);
      message.setReject("Message could not be processed.");
    }
  }
};
