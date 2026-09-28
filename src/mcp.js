import {
  authenticateMcp,
  ensureOAuthTables,
  oauthChallenge,
} from "./mcp-oauth.js";

const PROTOCOL_VERSION = "2025-03-26";

const RECIPE_PROPERTIES = {
  title: { type: "string", description: "Название рецепта." },
  description: { type: "string", description: "Краткое описание." },
  servings: { type: "number", description: "Количество порций." },
  servingsText: { type: "string", description: "Текстовое описание порций, если нужно." },
  prepMinutes: { type: "integer", minimum: 0 },
  cookMinutes: { type: "integer", minimum: 0 },
  totalMinutes: { type: "integer", minimum: 0 },
  sourceName: { type: "string", description: "Название источника." },
  sourceUrl: { type: "string", description: "URL источника, если есть." },
  imageKey: { type: "string", description: "Ключ изображения, полученный uploadRecipeImage." },
  imageSourceUrl: { type: "string" },
  tips: { type: "string" },
  serveWith: { type: "string" },
  notes: { type: "string" },
  batchTip: { type: "string" },
  highlight: { type: "string" },
  categories: {
    type: "array",
    items: { type: "string" },
    description: "Категории рецепта.",
  },
  tags: {
    type: "array",
    items: { type: "string" },
    description: "Текстовые метки рецепта.",
  },
  ingredients: {
    type: "array",
    minItems: 1,
    items: {
      oneOf: [
        { type: "string" },
        {
          type: "object",
          properties: {
            position: { type: "integer" },
            section: { type: ["string", "null"] },
            name: { type: "string" },
            amount: { type: ["number", "null"] },
            amountMin: { type: ["number", "null"] },
            amountMax: { type: ["number", "null"] },
            unit: { type: ["string", "null"] },
            rawText: { type: "string" },
          },
          required: ["name"],
          additionalProperties: true,
        },
      ],
    },
  },
  steps: {
    type: "array",
    minItems: 1,
    items: {
      oneOf: [
        { type: "string" },
        {
          type: "object",
          properties: {
            position: { type: "integer" },
            section: { type: ["string", "null"] },
            instruction: { type: "string" },
          },
          required: ["instruction"],
          additionalProperties: true,
        },
      ],
    },
  },
  isVerified: { type: "boolean" },
  isWeeklyPrep: { type: "boolean" },
  isFavorite: { type: "boolean" },
};

const TOOLS = [
  {
    name: "searchRecipes",
    description:
      "Search the private recipe book before drafting or saving a recipe. Use this to detect exact and similar duplicates.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Recipe title or source text to search for.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "getRecipe",
    description:
      "Read one complete recipe from the book by slug, including ingredients, steps, categories and tags.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "uploadRecipeImage",
    description:
      "Store a recipe cover image in the book image storage. Pass either a reachable HTTPS imageUrl or an imageDataUrl (data:image/png;base64,...). Returns a real imageKey for createRecipe.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Recipe title, used for the stored image filename." },
        imageUrl: {
          type: "string",
          description: "Reachable HTTPS URL for a JPG, PNG or WebP image.",
        },
        imageDataUrl: {
          type: "string",
          description: "Data URL containing JPG, PNG or WebP bytes.",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "createRecipe",
    description:
      "Create a new recipe in the book after the user has explicitly approved the complete card. The server rejects exact duplicates.",
    inputSchema: {
      type: "object",
      properties: RECIPE_PROPERTIES,
      required: ["title", "ingredients", "steps"],
      additionalProperties: true,
    },
  },
  {
    name: "updateRecipe",
    description:
      "Update an existing recipe by slug. Use only when the user explicitly asks to edit an existing recipe.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        recipe: {
          type: "object",
          properties: RECIPE_PROPERTIES,
          required: ["title", "ingredients", "steps"],
          additionalProperties: true,
        },
      },
      required: ["slug", "recipe"],
      additionalProperties: false,
    },
  },
];

function rpc(id, result) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function toolResult(data, isError = false) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return {
    isError,
    content: [{ type: "text", text }],
  };
}

async function parseResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { success: false, error: "Invalid server response", details: text.slice(0, 1000) };
  }
  return { response, data };
}

function internalHeaders(env, jsonBody = false) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${env.ADMIN_API_KEY}`,
    ...(jsonBody ? { "Content-Type": "application/json" } : {}),
  };
}

async function callBookApi(env, origin, path, init = {}) {
  return fetch(new URL(path, origin).href, init);
}

function safeRemoteUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Image URL must use HTTPS.");

  const host = url.hostname.toLowerCase();
  const forbidden =
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host);

  if (forbidden) throw new Error("Private network image URLs are not allowed.");
  return url;
}

function decodeDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new Error("Unsupported image data URL.");

  const binary = atob(match[2].replace(/\s+/g, ""));
  if (binary.length > 8 * 1024 * 1024) throw new Error("Image exceeds 8 MB.");

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return { bytes, contentType: match[1] };
}

async function uploadImage(args, env, origin) {
  if (!args.imageUrl && !args.imageDataUrl) {
    throw new Error("Provide imageUrl or imageDataUrl.");
  }
  if (args.imageUrl && args.imageDataUrl) {
    throw new Error("Provide only one image source.");
  }

  let bytes;
  let contentType;

  if (args.imageDataUrl) {
    ({ bytes, contentType } = decodeDataUrl(args.imageDataUrl));
  } else {
    const remote = safeRemoteUrl(args.imageUrl);
    const response = await fetch(remote.href, {
      headers: { Accept: "image/png,image/jpeg,image/webp" },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Image download failed with HTTP ${response.status}.`);
    }

    contentType = (response.headers.get("Content-Type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
      throw new Error("Image must be JPG, PNG or WebP.");
    }

    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > 8 * 1024 * 1024) {
      throw new Error("Image must be between 1 byte and 8 MB.");
    }
    bytes = new Uint8Array(buffer);
  }

  const extension =
    contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const form = new FormData();
  form.append("title", args.title);
  form.append("image", new File([bytes], `recipe.${extension}`, { type: contentType }));

  const response = await callBookApi(env, origin, "/api/assistant/images", {
    method: "POST",
    headers: internalHeaders(env, false),
    body: form,
  });

  const parsed = await parseResponse(response);
  if (!response.ok || parsed.data?.success !== true) {
    throw new Error(parsed.data?.message || parsed.data?.error || "Image upload failed.");
  }
  return parsed.data;
}

async function executeTool(name, args, env, origin) {
  if (name === "searchRecipes") {
    const response = await callBookApi(
      env,
      origin,
      `/api/assistant/recipes/search?query=${encodeURIComponent(args.query)}`,
      { headers: internalHeaders(env) }
    );
    const parsed = await parseResponse(response);
    return toolResult(parsed.data, !response.ok || parsed.data?.success === false);
  }

  if (name === "getRecipe") {
    const response = await callBookApi(
      env,
      origin,
      `/api/recipes/${encodeURIComponent(args.slug)}`,
      { headers: { Accept: "application/json" } }
    );
    const parsed = await parseResponse(response);
    return toolResult(parsed.data, !response.ok || parsed.data?.success === false);
  }

  if (name === "uploadRecipeImage") {
    try {
      return toolResult(await uploadImage(args, env, origin));
    } catch (error) {
      return toolResult(
        { success: false, error: error instanceof Error ? error.message : String(error) },
        true
      );
    }
  }

  if (name === "createRecipe") {
    const response = await callBookApi(env, origin, "/api/assistant/recipes", {
      method: "POST",
      headers: internalHeaders(env, true),
      body: JSON.stringify(args),
    });
    const parsed = await parseResponse(response);
    return toolResult(parsed.data, !response.ok || parsed.data?.success === false);
  }

  if (name === "updateRecipe") {
    const response = await callBookApi(
      env,
      origin,
      `/api/assistant/recipes/${encodeURIComponent(args.slug)}`,
      {
        method: "PUT",
        headers: internalHeaders(env, true),
        body: JSON.stringify(args.recipe),
      }
    );
    const parsed = await parseResponse(response);
    return toolResult(parsed.data, !response.ok || parsed.data?.success === false);
  }

  return toolResult({ success: false, error: `Unknown tool: ${name}` }, true);
}

function requiredScopeForTool(name) {
  return ["createRecipe", "updateRecipe", "uploadRecipeImage"].includes(name)
    ? "recipes.write"
    : "recipes.read";
}

async function unauthorized(origin, scope) {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "WWW-Authenticate": oauthChallenge(origin, scope),
    },
  });
}

export async function handleMcp(request, env, url) {
  if (url.pathname !== "/mcp") return null;

  await ensureOAuthTables(env);

  if (request.method === "GET") {
    const auth = await authenticateMcp(request, env, url.origin, "recipes.read");
    if (!auth) return unauthorized(url.origin, "recipes.read");
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const id = payload?.id ?? null;
  const method = payload?.method;

  if (method === "initialize") {
    const auth = await authenticateMcp(request, env, url.origin, "recipes.read");
    if (!auth) return unauthorized(url.origin, "recipes.read");

    return rpc(id, {
      protocolVersion: payload?.params?.protocolVersion || PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: {
        name: "nataliya-menu",
        title: "Наталья и меню",
        version: "1.0.0",
      },
    });
  }

  if (method === "notifications/initialized") {
    const auth = await authenticateMcp(request, env, url.origin, "recipes.read");
    if (!auth) return unauthorized(url.origin, "recipes.read");
    return new Response(null, { status: 202 });
  }

  if (method === "ping") {
    const auth = await authenticateMcp(request, env, url.origin, "recipes.read");
    if (!auth) return unauthorized(url.origin, "recipes.read");
    return rpc(id, {});
  }

  if (method === "tools/list") {
    const auth = await authenticateMcp(request, env, url.origin, "recipes.read");
    if (!auth) return unauthorized(url.origin, "recipes.read");
    return rpc(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const name = payload?.params?.name;
    const args = payload?.params?.arguments || {};
    const scope = requiredScopeForTool(name);
    const auth = await authenticateMcp(request, env, url.origin, scope);
    if (!auth) return unauthorized(url.origin, scope);

    try {
      const result = await executeTool(name, args, env, url.origin);
      return rpc(id, result);
    } catch (error) {
      return rpcError(
        id,
        -32603,
        "Tool execution failed",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  if (id === null) {
    const auth = await authenticateMcp(request, env, url.origin, "recipes.read");
    if (!auth) return unauthorized(url.origin, "recipes.read");
    return new Response(null, { status: 202 });
  }

  return rpcError(id, -32601, "Method not found");
}
