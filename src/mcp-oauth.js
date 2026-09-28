const SCOPES = ["recipes.read", "recipes.write"];
const TOKEN_TTL = 30 * 24 * 60 * 60;
const CODE_TTL = 5 * 60;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function page(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

async function digestBytes(value) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)))
  );
}

async function digestHex(value) {
  return [...(await digestBytes(value))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function digestB64url(value) {
  return b64url(await digestBytes(value));
}

async function secureEqual(a, b) {
  const [left, right] = await Promise.all([digestBytes(a), digestBytes(b)]);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function normalizeScope(value) {
  const parts = String(value || SCOPES.join(" "))
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const unique = [...new Set(parts)];
  if (!unique.length || unique.some((part) => !SCOPES.includes(part))) return null;
  return unique.join(" ");
}

function hasScope(scope, required) {
  return String(scope || "").split(/\s+/).includes(required);
}

export async function ensureOAuthTables(env) {
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS oauth_clients (
        client_id TEXT PRIMARY KEY,
        redirect_uris TEXT NOT NULL,
        client_name TEXT,
        created_at INTEGER NOT NULL
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS oauth_codes (
        code_hash TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        scope TEXT NOT NULL,
        resource TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        token_hash TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        resource TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `),
  ]);
}

function protectedResourceMetadata(origin) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
  };
}

function authorizationServerMetadata(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: SCOPES,
  };
}

function validateRedirectUris(payload) {
  const values = Array.isArray(payload?.redirect_uris) ? payload.redirect_uris : [];
  if (!values.length || values.length > 10) return null;

  const result = [];
  for (const value of values) {
    try {
      const parsed = new URL(value);
      const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
      if (parsed.protocol !== "https:" && !local) return null;
      result.push(parsed.href);
    } catch {
      return null;
    }
  }
  return [...new Set(result)];
}

async function registerClient(request, env) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return json({ error: "invalid_client_metadata", error_description: "Invalid JSON." }, 400);
  }

  const redirectUris = validateRedirectUris(payload);
  if (!redirectUris) {
    return json(
      {
        error: "invalid_redirect_uri",
        error_description: "At least one valid HTTPS redirect URI is required.",
      },
      400
    );
  }

  const clientId = `menu_${randomToken(24)}`;
  const clientName = String(payload.client_name || "ChatGPT").slice(0, 200);

  await env.DB.prepare(`
    INSERT INTO oauth_clients (client_id, redirect_uris, client_name, created_at)
    VALUES (?, ?, ?, ?)
  `)
    .bind(clientId, JSON.stringify(redirectUris), clientName, now())
    .run();

  return json(
    {
      client_id: clientId,
      client_id_issued_at: now(),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201
  );
}

async function getClient(env, clientId) {
  if (!clientId) return null;
  return env.DB.prepare(`
    SELECT client_id, redirect_uris, client_name
    FROM oauth_clients
    WHERE client_id = ?
    LIMIT 1
  `)
    .bind(clientId)
    .first();
}

function clientRedirects(client) {
  try {
    return JSON.parse(client?.redirect_uris || "[]");
  } catch {
    return [];
  }
}

async function validateAuthorization(params, env) {
  const clientId = params.get("client_id");
  const client = await getClient(env, clientId);
  if (!client) return { error: "Unknown OAuth client." };

  let redirectUri;
  try {
    redirectUri = new URL(params.get("redirect_uri")).href;
  } catch {
    return { error: "Invalid redirect URI." };
  }

  if (!clientRedirects(client).includes(redirectUri)) {
    return { error: "Redirect URI is not registered." };
  }

  if (params.get("response_type") !== "code") {
    return { error: "Only response_type=code is supported." };
  }

  const scope = normalizeScope(params.get("scope"));
  if (!scope) return { error: "Unsupported OAuth scope." };

  const challenge = params.get("code_challenge");
  if (!challenge || params.get("code_challenge_method") !== "S256") {
    return { error: "PKCE S256 is required." };
  }

  return { client, clientId, redirectUri, scope, challenge };
}

function authorizationPage(params, client, message = "") {
  const names = [
    "response_type",
    "client_id",
    "redirect_uri",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
    "resource",
  ];

  const hidden = names
    .map((name) => {
      const value = params.get(name);
      return value === null
        ? ""
        : `<input type="hidden" name="${name}" value="${esc(value)}">`;
    })
    .join("\n");

  const error = message ? `<p class="error">${esc(message)}</p>` : "";

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Подключение книги рецептов</title>
<style>
body{font-family:system-ui,sans-serif;background:#f5f5f3;color:#191919;margin:0;padding:28px}
main{max-width:520px;margin:8vh auto;background:#fff;border:1px solid #e2e2de;border-radius:18px;padding:26px}
h1{font-size:23px;margin:0 0 12px}p{line-height:1.45;color:#555}
label{display:block;font-weight:650;margin:22px 0 8px}
input{box-sizing:border-box;width:100%;padding:13px;border:1px solid #ccc;border-radius:10px;font-size:16px}
button{width:100%;padding:13px;margin-top:18px;border:0;border-radius:10px;background:#222;color:#fff;font-size:16px;font-weight:700}
.error{background:#fff0f0;color:#9a2020;padding:10px;border-radius:8px}
.meta{font-size:12px;color:#777;word-break:break-word}
</style>
</head>
<body>
<main>
<h1>«Наталья и меню»</h1>
<p>Введите тот же ключ редактора, который используется в админке книги. Ключ проверяется на сервере книги и не передаётся ChatGPT.</p>
${error}
<form method="post" action="/oauth/authorize">
${hidden}
<label for="editor_key">Ключ редактора</label>
<input id="editor_key" name="editor_key" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Разрешить доступ</button>
</form>
<p class="meta">Клиент: ${esc(client?.client_name || client?.client_id || "ChatGPT")}</p>
</main>
</body>
</html>`;
}

async function authorizeGet(env, url) {
  const checked = await validateAuthorization(url.searchParams, env);
  if (checked.error) {
    return page(`<h1>Ошибка подключения</h1><p>${esc(checked.error)}</p>`, 400);
  }
  return page(authorizationPage(url.searchParams, checked.client));
}

async function authorizePost(request, env, origin) {
  const form = await request.formData();
  const params = new URLSearchParams();

  for (const name of [
    "response_type",
    "client_id",
    "redirect_uri",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
    "resource",
  ]) {
    const value = form.get(name);
    if (value !== null) params.set(name, String(value));
  }

  const checked = await validateAuthorization(params, env);
  if (checked.error) {
    return page(`<h1>Ошибка подключения</h1><p>${esc(checked.error)}</p>`, 400);
  }

  const supplied = String(form.get("editor_key") || "");
  const expected = String(env.ADMIN_API_KEY || "");
  if (!expected || !supplied || !(await secureEqual(supplied, expected))) {
    return page(
      authorizationPage(params, checked.client, "Ключ редактора не подошёл."),
      401
    );
  }

  const code = randomToken();
  const resource = params.get("resource") || `${origin}/mcp`;

  await env.DB.prepare(`
    INSERT INTO oauth_codes
      (code_hash, client_id, redirect_uri, code_challenge, scope, resource, expires_at, used_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `)
    .bind(
      await digestHex(code),
      checked.clientId,
      checked.redirectUri,
      checked.challenge,
      checked.scope,
      resource,
      now() + CODE_TTL
    )
    .run();

  const destination = new URL(checked.redirectUri);
  destination.searchParams.set("code", code);
  const state = params.get("state");
  if (state) destination.searchParams.set("state", state);

  return Response.redirect(destination.href, 302);
}

async function token(request, env) {
  const contentType = request.headers.get("Content-Type") || "";
  let params;

  if (contentType.includes("application/json")) {
    const payload = await request.json().catch(() => ({}));
    params = new URLSearchParams();
    for (const [key, value] of Object.entries(payload || {})) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
  } else {
    params = new URLSearchParams(await request.text());
  }

  if (params.get("grant_type") !== "authorization_code") {
    return json({ error: "unsupported_grant_type" }, 400);
  }

  const code = params.get("code") || "";
  const clientId = params.get("client_id") || "";
  const verifier = params.get("code_verifier") || "";

  let redirectUri;
  try {
    redirectUri = new URL(params.get("redirect_uri")).href;
  } catch {
    return json({ error: "invalid_grant" }, 400);
  }

  if (!code || !clientId || !verifier) {
    return json({ error: "invalid_request" }, 400);
  }

  const codeHash = await digestHex(code);
  const row = await env.DB.prepare(`
    SELECT client_id, redirect_uri, code_challenge, scope, resource, expires_at, used_at
    FROM oauth_codes
    WHERE code_hash = ?
    LIMIT 1
  `)
    .bind(codeHash)
    .first();

  if (
    !row ||
    row.used_at ||
    row.expires_at < now() ||
    row.client_id !== clientId ||
    row.redirect_uri !== redirectUri
  ) {
    return json({ error: "invalid_grant" }, 400);
  }

  if (!(await secureEqual(await digestB64url(verifier), row.code_challenge))) {
    return json({ error: "invalid_grant" }, 400);
  }

  const accessToken = randomToken();
  const issued = now();

  await env.DB.batch([
    env.DB.prepare("UPDATE oauth_codes SET used_at = ? WHERE code_hash = ?").bind(
      issued,
      codeHash
    ),
    env.DB.prepare(`
      INSERT INTO oauth_tokens
        (token_hash, client_id, scope, resource, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      await digestHex(accessToken),
      clientId,
      row.scope,
      row.resource,
      issued,
      issued + TOKEN_TTL
    ),
  ]);

  return json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_TTL,
    scope: row.scope,
  });
}

export function oauthChallenge(origin, scope) {
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${scope}", error="invalid_token", error_description="Connect access to the recipe book"`;
}

export async function authenticateMcp(request, env, origin, requiredScope) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;

  const value = header.slice("Bearer ".length).trim();
  if (!value) return null;

  const row = await env.DB.prepare(`
    SELECT client_id, scope, resource, expires_at
    FROM oauth_tokens
    WHERE token_hash = ?
    LIMIT 1
  `)
    .bind(await digestHex(value))
    .first();

  if (!row || row.expires_at < now()) return null;
  if (row.resource !== `${origin}/mcp`) return null;
  if (requiredScope && !hasScope(row.scope, requiredScope)) return null;

  return row;
}

export async function handleOAuthRoute(request, env, url) {
  const path = url.pathname;
  const relevant =
    path === "/.well-known/oauth-protected-resource" ||
    path === "/.well-known/oauth-protected-resource/mcp" ||
    path === "/.well-known/oauth-authorization-server" ||
    path === "/oauth/register" ||
    path === "/oauth/authorize" ||
    path === "/oauth/token";

  if (!relevant) return null;

  await ensureOAuthTables(env);

  if (
    (path === "/.well-known/oauth-protected-resource" ||
      path === "/.well-known/oauth-protected-resource/mcp") &&
    request.method === "GET"
  ) {
    return json(protectedResourceMetadata(url.origin));
  }

  if (
    path === "/.well-known/oauth-authorization-server" &&
    request.method === "GET"
  ) {
    return json(authorizationServerMetadata(url.origin));
  }

  if (path === "/oauth/register" && request.method === "POST") {
    return registerClient(request, env);
  }

  if (path === "/oauth/authorize" && request.method === "GET") {
    return authorizeGet(env, url);
  }

  if (path === "/oauth/authorize" && request.method === "POST") {
    return authorizePost(request, env, url.origin);
  }

  if (path === "/oauth/token" && request.method === "POST") {
    return token(request, env);
  }

  return json({ error: "method_not_allowed" }, 405);
}
