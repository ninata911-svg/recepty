import {
  authenticateMcp,
  ensureOAuthTables,
  oauthChallenge,
} from "./mcp-oauth.js";

const PROTOCOL_VERSION = "2025-03-26";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const RECIPE_PROPERTIES = {
  title: { type: "string", description: "Название рецепта." },
  description: { type: "string", description: "Краткое описание." },
  servings: { type: "number", description: "Количество порций." },
  servingsText: { type: "string" },
  prepMinutes: { type: "integer", minimum: 0 },
  cookMinutes: { type: "integer", minimum: 0 },
  totalMinutes: { type: "integer", minimum: 0 },
  sourceName: { type: "string" },
  sourceUrl: { type: "string" },
  imageKey: { type: "string", description: "Ключ из uploadRecipeImage." },
  imageSourceUrl: { type: "string" },
  imageCredit: { type: "string" },
  tips: { type: "string" },
  serveWith: { type: "string" },
  notes: { type: "string" },
  batchTip: { type: "string" },
  highlight: { type: "string" },
  categories: { type: "array", items: { type: "string" } },
  tags: { type: "array", items: { type: "string" } },
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
      "Search the recipe book before drafting or saving. Use this to detect exact and similar duplicates.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Recipe title or source text." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "getRecipe",
    description:
      "Read one complete recipe by slug, including ingredients, steps, categories and tags.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "uploadRecipeImage",
    description:
      "Store a recipe cover image in R2. Pass either a reachable HTTPS imageUrl or imageDataUrl. Returns a real imageKey for createRecipe.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        imageUrl: { type: "string" },
        imageDataUrl: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "createRecipe",
    description:
      "Create a new recipe only after the complete card has been shown and the user explicitly approved it. Exact duplicates are rejected.",
    inputSchema: {
      type: "object",
      properties: RECIPE_PROPERTIES,
      required: ["title", "ingredients", "steps"],
      additionalProperties: true,
    },
  },
];

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = numberOrNull(value);
  return number === null ? null : Math.max(0, Math.round(number));
}

function booleanToInteger(value) {
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}

function normalizeForComparison(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ");
}

function transliterate(value) {
  const map = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"j",
    к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
    х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
  };
  return String(value ?? "")
    .toLocaleLowerCase("ru-RU")
    .split("")
    .map((character) => map[character] ?? character)
    .join("");
}

function slugify(value) {
  return transliterate(value)
    .replace(/['"`’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 100);
}

function normalizeHttpUrl(value) {
  const text = stringOrNull(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.href;
  } catch {
    throw new Error(`Некорректная ссылка: ${text}`);
  }
}

function normalizeNamedList(values) {
  const source = Array.isArray(values) ? values : values ? [values] : [];
  const result = [];
  const used = new Set();

  for (const item of source) {
    const name = stringOrNull(
      typeof item === "object" && item !== null ? item.name : item
    );
    if (!name) continue;

    const key = normalizeForComparison(name);
    if (used.has(key)) continue;
    used.add(key);
    result.push(name);
  }
  return result;
}

function composeIngredientText(ingredient) {
  let quantity = "";
  if (ingredient.amountMin !== null && ingredient.amountMax !== null) {
    quantity = `${ingredient.amountMin}–${ingredient.amountMax}`;
  } else if (ingredient.amount !== null) {
    quantity = String(ingredient.amount);
  }
  const quantityWithUnit = [quantity, ingredient.unit].filter(Boolean).join(" ");
  return quantityWithUnit ? `${ingredient.name} — ${quantityWithUnit}` : ingredient.name;
}

function normalizeIngredients(values) {
  if (!Array.isArray(values)) return [];

  return values
    .slice(0, 200)
    .map((item, index) => {
      if (typeof item === "string") {
        const rawText = item.trim();
        if (!rawText) return null;
        return {
          position: index + 1,
          section: null,
          name: rawText.split(/\s+[—–-]\s+/)[0]?.trim() || rawText,
          amount: null,
          amountMin: null,
          amountMax: null,
          unit: null,
          rawText,
        };
      }

      if (!item || typeof item !== "object") return null;
      const rawText = stringOrNull(item.rawText ?? item.raw_text);
      const name =
        stringOrNull(item.name) ||
        rawText?.split(/\s+[—–-]\s+/)[0]?.trim() ||
        null;
      if (!name) return null;

      const ingredient = {
        position: integerOrNull(item.position) || index + 1,
        section: stringOrNull(item.section),
        name,
        amount: numberOrNull(item.amount),
        amountMin: numberOrNull(item.amountMin ?? item.amount_min),
        amountMax: numberOrNull(item.amountMax ?? item.amount_max),
        unit: stringOrNull(item.unit),
        rawText: "",
      };
      ingredient.rawText = rawText || composeIngredientText(ingredient);
      return ingredient;
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position);
}

function normalizeSteps(values) {
  if (!Array.isArray(values)) return [];

  return values
    .slice(0, 100)
    .map((item, index) => {
      if (typeof item === "string") {
        const instruction = item.trim();
        return instruction
          ? { position: index + 1, section: null, instruction }
          : null;
      }
      if (!item || typeof item !== "object") return null;
      const instruction = stringOrNull(item.instruction ?? item.text);
      if (!instruction) return null;
      return {
        position: integerOrNull(item.position) || index + 1,
        section: stringOrNull(item.section),
        instruction,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position);
}

async function createUniqueSlug(database, requestedSlug, title) {
  const baseSlug =
    slugify(requestedSlug || title) || `recipe-${crypto.randomUUID().slice(0, 8)}`;
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await database
      .prepare("SELECT id FROM recipes WHERE slug = ? LIMIT 1")
      .bind(slug)
      .first();
    if (!existing) return slug;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
    if (suffix > 100) return `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
  }
}

async function findDuplicateRecipe(database, title, sourceUrl) {
  const result = await database
    .prepare(`
      SELECT id, slug, title, source_url
      FROM recipes
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `)
    .all();

  const normalizedTitle = normalizeForComparison(title);
  const byTitle = (result.results ?? []).find(
    (recipe) => normalizeForComparison(recipe.title) === normalizedTitle
  );
  if (byTitle) return byTitle;

  if (sourceUrl) {
    const bySource = (result.results ?? []).find(
      (recipe) => recipe.source_url === sourceUrl
    );
    if (bySource) return bySource;
  }
  return null;
}

function createImageKey(title, contentType) {
  const extension = IMAGE_TYPES.get(contentType);
  const baseName = slugify(title) || "recipe";
  return `recipes/${baseName}-${crypto.randomUUID().slice(0, 12)}.${extension}`;
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
  const match = String(value || "").match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/
  );
  if (!match) throw new Error("Unsupported image data URL.");

  const binary = atob(match[2].replace(/\s+/g, ""));
  if (!binary.length || binary.length > MAX_IMAGE_BYTES) {
    throw new Error("Image must be between 1 byte and 8 MB.");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, contentType: match[1] };
}

async function searchRecipes(args, env, origin) {
  const query = normalizeForComparison(args.query);
  if (!query) return { success: true, items: [] };

  const result = await env.DB.prepare(`
    SELECT id, slug, title, description, source_url, updated_at
    FROM recipes
    WHERE deleted_at IS NULL
    ORDER BY title COLLATE NOCASE
  `).all();

  const items = (result.results ?? [])
    .filter((recipe) =>
      normalizeForComparison(
        [recipe.title, recipe.description, recipe.source_url].join(" ")
      ).includes(query)
    )
    .slice(0, 20)
    .map((recipe) => ({
      ...recipe,
      url: `${origin}/recipe?slug=${encodeURIComponent(recipe.slug)}`,
    }));

  return { success: true, items };
}

async function getRecipe(args, env) {
  const slug = stringOrNull(args.slug);
  if (!slug) return { success: false, error: "Recipe slug is required." };

  const recipe = await env.DB.prepare(`
    SELECT
      id, slug, title, description,
      servings, servings_text, servings_min, servings_max,
      prep_minutes, cook_minutes, total_minutes,
      source_name, source_url,
      image_key, image_source_url, image_credit,
      tips, serve_with, notes, batch_tip, highlight,
      nutrition_basis, calories_kcal, protein_g, fat_g, carbs_g,
      is_verified, is_weekly_prep, is_favorite,
      created_at, updated_at
    FROM recipes
    WHERE slug = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(slug).first();

  if (!recipe) return { success: false, error: "Recipe not found." };

  const [ingredients, steps, categories, tags] = await Promise.all([
    env.DB.prepare(`
      SELECT id, position, section, name, amount, amount_min, amount_max, unit, raw_text
      FROM ingredients WHERE recipe_id = ? ORDER BY position
    `).bind(recipe.id).all(),
    env.DB.prepare(`
      SELECT id, position, section, instruction
      FROM steps WHERE recipe_id = ? ORDER BY position
    `).bind(recipe.id).all(),
    env.DB.prepare(`
      SELECT c.id, c.name, c.slug
      FROM categories c
      INNER JOIN recipe_categories rc ON rc.category_id = c.id
      WHERE rc.recipe_id = ?
      ORDER BY c.name COLLATE NOCASE
    `).bind(recipe.id).all(),
    env.DB.prepare(`
      SELECT t.id, t.name, t.slug
      FROM tags t
      INNER JOIN recipe_tags rt ON rt.tag_id = t.id
      WHERE rt.recipe_id = ?
      ORDER BY t.name COLLATE NOCASE
    `).bind(recipe.id).all(),
  ]);

  return {
    success: true,
    item: {
      ...recipe,
      ingredients: ingredients.results ?? [],
      steps: steps.results ?? [],
      categories: categories.results ?? [],
      tags: tags.results ?? [],
    },
  };
}

async function uploadRecipeImage(args, env, origin) {
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

    if (!IMAGE_TYPES.has(contentType)) {
      throw new Error("Image must be JPG, PNG or WebP.");
    }

    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Image must be between 1 byte and 8 MB.");
    }
    bytes = new Uint8Array(buffer);
  }

  if (!IMAGE_TYPES.has(contentType)) throw new Error("Unsupported image type.");

  const key = createImageKey(args.title, contentType);
  await env.IMAGES.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      originalName: "mcp-upload",
      uploadedAt: new Date().toISOString(),
    },
  });

  const imagePath = `/images/${key}`;
  return {
    success: true,
    message: "Фотография загружена.",
    item: {
      key,
      imageKey: imagePath,
      url: new URL(imagePath, origin).href,
      contentType,
      size: bytes.byteLength,
    },
  };
}

async function createRecipe(args, env, origin) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { success: false, error: "Invalid recipe." };
  }

  const title = stringOrNull(args.title);
  if (!title) return { success: false, error: "Validation failed", fields: { title: "Укажите название рецепта." } };
  if (title.length > 200) {
    return {
      success: false,
      error: "Validation failed",
      fields: { title: "Название не должно превышать 200 символов." },
    };
  }

  const ingredients = normalizeIngredients(args.ingredients);
  const steps = normalizeSteps(args.steps);
  const fields = {};
  if (!ingredients.length) fields.ingredients = "Добавьте хотя бы один ингредиент.";
  if (!steps.length) fields.steps = "Добавьте хотя бы один шаг приготовления.";
  if (Object.keys(fields).length) {
    return { success: false, error: "Validation failed", fields };
  }

  let sourceUrl;
  let imageSourceUrl;
  try {
    sourceUrl = normalizeHttpUrl(args.sourceUrl ?? args.source_url);
    imageSourceUrl = normalizeHttpUrl(args.imageSourceUrl ?? args.image_source_url);
  } catch (error) {
    return {
      success: false,
      error: "Validation failed",
      message: error instanceof Error ? error.message : "Некорректная ссылка.",
    };
  }

  const duplicate = await findDuplicateRecipe(env.DB, title, sourceUrl);
  if (duplicate) {
    return {
      success: false,
      error: "Duplicate recipe",
      message: "В книге уже есть рецепт с таким названием или источником.",
      existing: {
        id: duplicate.id,
        title: duplicate.title,
        slug: duplicate.slug,
        url: `${origin}/recipe?slug=${encodeURIComponent(duplicate.slug)}`,
      },
    };
  }

  const id = crypto.randomUUID();
  const slug = await createUniqueSlug(env.DB, args.slug, title);

  const categories = normalizeNamedList([
    ...(Array.isArray(args.categories) ? args.categories : []),
    ...(args.category ? [args.category] : []),
  ]);
  if (!categories.length) categories.push("Без категории");

  const tags = normalizeNamedList(args.tags);

  const recipeValues = [
    id,
    slug,
    title,
    stringOrNull(args.description),
    numberOrNull(args.servings),
    stringOrNull(args.servingsText ?? args.servings_text),
    numberOrNull(args.servingsMin ?? args.servings_min),
    numberOrNull(args.servingsMax ?? args.servings_max),
    integerOrNull(args.prepMinutes ?? args.prep_minutes),
    integerOrNull(args.cookMinutes ?? args.cook_minutes),
    integerOrNull(args.totalMinutes ?? args.total_minutes),
    stringOrNull(args.sourceName ?? args.source_name),
    sourceUrl,
    stringOrNull(args.imageKey ?? args.image_key),
    imageSourceUrl,
    stringOrNull(args.imageCredit ?? args.image_credit),
    stringOrNull(args.tips),
    stringOrNull(args.serveWith ?? args.serve_with),
    stringOrNull(args.notes),
    stringOrNull(args.batchTip ?? args.batch_tip),
    stringOrNull(args.highlight),
    stringOrNull(args.nutritionBasis ?? args.nutrition_basis),
    numberOrNull(args.caloriesKcal ?? args.calories_kcal),
    numberOrNull(args.proteinG ?? args.protein_g),
    numberOrNull(args.fatG ?? args.fat_g),
    numberOrNull(args.carbsG ?? args.carbs_g),
    booleanToInteger(args.isVerified ?? args.is_verified),
    booleanToInteger(args.isWeeklyPrep ?? args.is_weekly_prep),
    booleanToInteger(args.isFavorite ?? args.is_favorite),
    null,
  ];

  const statements = [
    env.DB.prepare(`
      INSERT INTO recipes (
        id, slug, title, description,
        servings, servings_text, servings_min, servings_max,
        prep_minutes, cook_minutes, total_minutes,
        source_name, source_url,
        image_key, image_source_url, image_credit,
        tips, serve_with, notes, batch_tip, highlight,
        nutrition_basis, calories_kcal, protein_g, fat_g, carbs_g,
        is_verified, is_weekly_prep, is_favorite,
        reset_box_exported_at,
        created_at, updated_at, deleted_at
      )
      VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
      )
    `).bind(...recipeValues),
  ];

  for (const ingredient of ingredients) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO ingredients (
          recipe_id, position, section, name, amount,
          amount_min, amount_max, unit, raw_text
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        ingredient.position,
        ingredient.section,
        ingredient.name,
        ingredient.amount,
        ingredient.amountMin,
        ingredient.amountMax,
        ingredient.unit,
        ingredient.rawText
      )
    );
  }

  for (const step of steps) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO steps (recipe_id, position, section, instruction)
        VALUES (?, ?, ?, ?)
      `).bind(id, step.position, step.section, step.instruction)
    );
  }

  for (const categoryName of categories.slice(0, 20)) {
    const categorySlug =
      slugify(categoryName) || `category-${crypto.randomUUID().slice(0, 8)}`;

    statements.push(
      env.DB.prepare(`
        INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)
      `).bind(categoryName, categorySlug)
    );
    statements.push(
      env.DB.prepare(`
        INSERT OR IGNORE INTO recipe_categories (recipe_id, category_id)
        SELECT ?, id FROM categories WHERE slug = ?
      `).bind(id, categorySlug)
    );
  }

  for (const tagName of tags.slice(0, 30)) {
    const tagSlug = slugify(tagName) || `tag-${crypto.randomUUID().slice(0, 8)}`;
    statements.push(
      env.DB.prepare(`
        INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)
      `).bind(tagName, tagSlug)
    );
    statements.push(
      env.DB.prepare(`
        INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id)
        SELECT ?, id FROM tags WHERE slug = ?
      `).bind(id, tagSlug)
    );
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    return {
      success: false,
      error: "Database write failed",
      message: "Не удалось сохранить рецепт в базе.",
      details: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    success: true,
    message: "Рецепт добавлен в книгу.",
    item: {
      id,
      slug,
      title,
      url: `${origin}/recipe?slug=${encodeURIComponent(slug)}`,
    },
  };
}

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
  return {
    isError,
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function requiredScopeForTool(name) {
  return ["createRecipe", "uploadRecipeImage"].includes(name)
    ? "recipes.write"
    : "recipes.read";
}

function unauthorized(origin, scope) {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "WWW-Authenticate": oauthChallenge(origin, scope),
    },
  });
}

async function executeTool(name, args, env, origin) {
  if (name === "searchRecipes") return searchRecipes(args, env, origin);
  if (name === "getRecipe") return getRecipe(args, env);
  if (name === "uploadRecipeImage") return uploadRecipeImage(args, env, origin);
  if (name === "createRecipe") return createRecipe(args, env, origin);
  throw new Error(`Unknown tool: ${name}`);
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
      const data = await executeTool(name, args, env, url.origin);
      return rpc(id, toolResult(data, data?.success === false));
    } catch (error) {
      return rpc(
        id,
        toolResult(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          true
        )
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
