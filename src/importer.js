const textEncoder = new TextEncoder();

const ALLOWED_ORIGIN = "https://recepty.ninata911.workers.dev";
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(),
    },
  });
}

function stringOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function numberFromText(value) {
  const text = stringOrNull(value);

  if (!text) {
    return null;
  }

  const match = text.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&laquo;/gi, "«")
    .replace(/&raquo;/gi, "»");
}

function cleanText(value) {
  const text = stringOrNull(value);

  if (!text) {
    return null;
  }

  return decodeHtmlEntities(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function normalizeForComparison(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ");
}

function transliterate(value) {
  const map = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
    ж: "zh", з: "z", и: "i", й: "j", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
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

function isIpLiteral(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "");

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return true;
  }

  return host.includes(":");
}

function normalizeExternalUrl(value) {
  const text = stringOrNull(value);

  if (!text) {
    throw new Error("Укажите ссылку на рецепт.");
  }

  let url;

  try {
    url = new URL(text);
  } catch {
    throw new Error("Ссылка имеет неверный формат.");
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("Допустимы только ссылки http и https.");
  }

  if (url.username || url.password) {
    throw new Error("Ссылки с логином и паролем не поддерживаются.");
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isIpLiteral(hostname)
  ) {
    throw new Error("Локальные и служебные адреса не поддерживаются.");
  }

  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Ссылки с нестандартным портом не поддерживаются.");
  }

  url.hash = "";
  return url;
}

async function secureCompare(provided, expected) {
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(provided)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(expected)),
  ]);

  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

async function isAuthorized(request, env) {
  if (!env.ADMIN_API_KEY) {
    return false;
  }

  const authorization = request.headers.get("Authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return false;
  }

  const providedKey = authorization.slice("Bearer ".length).trim();

  if (!providedKey) {
    return false;
  }

  return secureCompare(providedKey, String(env.ADMIN_API_KEY));
}

async function requireAuthorization(request, env) {
  const authorized = await isAuthorized(request, env);

  if (authorized) {
    return null;
  }

  return jsonResponse(
    {
      success: false,
      error: "Unauthorized",
      message: "Для импорта нужен ключ редактора.",
    },
    401
  );
}

async function fetchWithRedirects(initialUrl, options = {}) {
  let currentUrl = normalizeExternalUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl.href, {
      ...options,
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");

      if (!location) {
        throw new Error("Сайт вернул перенаправление без нового адреса.");
      }

      if (redirectCount === MAX_REDIRECTS) {
        throw new Error("Слишком много перенаправлений.");
      }

      currentUrl = normalizeExternalUrl(new URL(location, currentUrl).href);
      continue;
    }

    return {
      response,
      finalUrl: currentUrl.href,
    };
  }

  throw new Error("Не удалось получить страницу.");
}

function parseAttributes(tag) {
  const attributes = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;

  while ((match = pattern.exec(tag)) !== null) {
    const name = match[1].toLowerCase();
    attributes[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attributes;
}

function extractMeta(html, names) {
  const normalizedNames = new Set(names.map((name) => name.toLowerCase()));
  const tags = html.match(/<meta\b[^>]*>/gi) || [];

  for (const tag of tags) {
    const attributes = parseAttributes(tag);
    const key = (attributes.property || attributes.name || "").toLowerCase();

    if (normalizedNames.has(key) && attributes.content) {
      return cleanText(attributes.content);
    }
  }

  return null;
}

function extractTitle(html) {
  const ogTitle = extractMeta(html, ["og:title", "twitter:title"]);

  if (ogTitle) {
    return ogTitle;
  }

  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(match[1]) : null;
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const raw = decodeHtmlEntities(match[1])
      .replace(/^\s*<!--/, "")
      .replace(/-->\s*$/, "")
      .replace(/^\s*<!\[CDATA\[/, "")
      .replace(/\]\]>\s*$/, "")
      .trim()
      .replace(/;\s*$/, "");

    if (raw) {
      blocks.push(raw);
    }
  }

  return blocks;
}

function parseJsonLdBlocks(blocks) {
  const values = [];

  for (const block of blocks) {
    try {
      values.push(JSON.parse(block));
    } catch (error) {
      console.warn("JSON-LD parse failed:", error);
    }
  }

  return values;
}

function typeIncludes(value, expectedType) {
  const types = Array.isArray(value) ? value : [value];

  return types.some((type) => {
    const normalized = String(type ?? "").toLowerCase();
    return normalized === expectedType.toLowerCase() ||
      normalized.endsWith(`/${expectedType.toLowerCase()}`);
  });
}

function findRecipeNode(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findRecipeNode(item);

      if (result) {
        return result;
      }
    }

    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  if (typeIncludes(value["@type"], "Recipe")) {
    return value;
  }

  if (value["@graph"]) {
    const graphResult = findRecipeNode(value["@graph"]);

    if (graphResult) {
      return graphResult;
    }
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const result = findRecipeNode(child);

      if (result) {
        return result;
      }
    }
  }

  return null;
}

function resolveUrl(value, baseUrl) {
  const text = stringOrNull(value);

  if (!text) {
    return null;
  }

  try {
    return normalizeExternalUrl(new URL(text, baseUrl).href).href;
  } catch {
    return null;
  }
}

function firstImageUrl(value, baseUrl) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = firstImageUrl(item, baseUrl);

      if (result) {
        return result;
      }
    }

    return null;
  }

  if (typeof value === "string") {
    return resolveUrl(value, baseUrl);
  }

  if (value && typeof value === "object") {
    return firstImageUrl(
      value.url || value.contentUrl || value.thumbnailUrl || value["@id"],
      baseUrl
    );
  }

  return null;
}

function normalizeIngredient(item) {
  if (typeof item === "string") {
    return cleanText(item);
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  if (item.value !== undefined || item.name || item.unitText || item.unitCode) {
    const quantity = cleanText(item.value);
    const unit = cleanText(item.unitText || item.unitCode);
    const name = cleanText(item.name);

    return [quantity, unit, name].filter(Boolean).join(" ") || null;
  }

  return cleanText(item.text || item.description);
}

function normalizeIngredients(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];

  return source
    .map(normalizeIngredient)
    .filter(Boolean)
    .slice(0, 250)
    .map((rawText, index) => ({
      position: index + 1,
      section: null,
      name: rawText.split(/\s+[—–-]\s+/)[0]?.trim() || rawText,
      amount: null,
      amountMin: null,
      amountMax: null,
      unit: null,
      rawText,
    }));
}

function flattenInstructions(value, section = null, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenInstructions(item, section, result);
    }

    return result;
  }

  if (typeof value === "string") {
    const lines = cleanText(value)
      ?.split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean) || [];

    for (const line of lines) {
      result.push({
        section,
        instruction: line.replace(/^\d+[.)]\s*/, ""),
      });
    }

    return result;
  }

  if (!value || typeof value !== "object") {
    return result;
  }

  if (typeIncludes(value["@type"], "HowToSection")) {
    const nextSection = cleanText(value.name) || section;
    flattenInstructions(value.itemListElement || value.steps, nextSection, result);
    return result;
  }

  if (typeIncludes(value["@type"], "HowToStep")) {
    const instruction = cleanText(value.text || value.description || value.name);

    if (instruction) {
      result.push({
        section,
        instruction,
      });
    }

    return result;
  }

  if (value.itemListElement) {
    flattenInstructions(value.itemListElement, section, result);
    return result;
  }

  const instruction = cleanText(value.text || value.description || value.name);

  if (instruction) {
    result.push({
      section,
      instruction,
    });
  }

  return result;
}

function normalizeSteps(value) {
  return flattenInstructions(value)
    .filter((item) => item.instruction)
    .slice(0, 150)
    .map((item, index) => ({
      position: index + 1,
      section: item.section || null,
      instruction: item.instruction,
    }));
}

function durationToMinutes(value) {
  const text = stringOrNull(value);

  if (!text) {
    return null;
  }

  const match = text.match(
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
  );

  if (!match) {
    return numberFromText(text);
  }

  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);

  return Math.round(days * 1440 + hours * 60 + minutes + seconds / 60);
}

function normalizeStringList(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];

  return source
    .flatMap((item) => String(item).split(/[,;|]/))
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function uniqueStrings(values) {
  const result = [];
  const used = new Set();

  for (const value of values) {
    const key = normalizeForComparison(value);

    if (!key || used.has(key)) {
      continue;
    }

    used.add(key);
    result.push(value);
  }

  return result;
}

function extractPersonOrOrganizationName(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = extractPersonOrOrganizationName(item);

      if (result) {
        return result;
      }
    }

    return null;
  }

  if (typeof value === "string") {
    return cleanText(value);
  }

  if (value && typeof value === "object") {
    return cleanText(value.name || value.legalName);
  }

  return null;
}

function parseRecipe(recipeNode, html, finalUrl) {
  const pageUrl = new URL(finalUrl);

  const title = cleanText(recipeNode.name) || extractTitle(html);
  const description = cleanText(recipeNode.description) ||
    extractMeta(html, ["og:description", "description", "twitter:description"]);

  const imageUrl = firstImageUrl(recipeNode.image, finalUrl) ||
    resolveUrl(extractMeta(html, ["og:image", "twitter:image"]), finalUrl);

  const ingredients = normalizeIngredients(
    recipeNode.recipeIngredient || recipeNode.ingredients
  );

  const steps = normalizeSteps(recipeNode.recipeInstructions);

  const category = normalizeStringList(recipeNode.recipeCategory)[0] || "Без категории";
  const tags = uniqueStrings([
    ...normalizeStringList(recipeNode.keywords),
    ...normalizeStringList(recipeNode.recipeCuisine),
  ]).slice(0, 30);

  const servingsText = normalizeStringList(recipeNode.recipeYield)[0] || null;
  const servings = numberFromText(servingsText);

  const prepMinutes = durationToMinutes(recipeNode.prepTime);
  const cookMinutes = durationToMinutes(recipeNode.cookTime);
  const totalMinutes = durationToMinutes(recipeNode.totalTime) ??
    (prepMinutes !== null || cookMinutes !== null
      ? (prepMinutes || 0) + (cookMinutes || 0)
      : null);

  const sourceName = extractPersonOrOrganizationName(recipeNode.author) ||
    extractPersonOrOrganizationName(recipeNode.publisher) ||
    pageUrl.hostname.replace(/^www\./, "");

  const nutrition = recipeNode.nutrition && typeof recipeNode.nutrition === "object"
    ? recipeNode.nutrition
    : {};

  const warnings = [];

  if (!ingredients.length) {
    warnings.push("Не удалось извлечь ингредиенты — заполните их вручную.");
  }

  if (!steps.length) {
    warnings.push("Не удалось извлечь приготовление — заполните шаги вручную.");
  }

  if (!imageUrl) {
    warnings.push("На странице не найдена подходящая фотография.");
  }

  return {
    title: title || "",
    description: description || null,
    category,
    tags,
    servings,
    servingsText,
    prepMinutes,
    cookMinutes,
    totalMinutes,
    imageSourceUrl: imageUrl,
    sourceName,
    sourceUrl: finalUrl,
    ingredients,
    steps,
    tips: null,
    serveWith: null,
    highlight: null,
    batchTip: null,
    notes: null,
    nutritionBasis: nutrition.calories || nutrition.proteinContent || nutrition.fatContent
      ? "По данным исходной страницы"
      : null,
    caloriesKcal: numberFromText(nutrition.calories),
    proteinG: numberFromText(nutrition.proteinContent),
    fatG: numberFromText(nutrition.fatContent),
    carbsG: numberFromText(nutrition.carbohydrateContent),
    isVerified: false,
    isFavorite: false,
    isWeeklyPrep: false,
    warnings,
  };
}

async function previewImport(request, env) {
  const authorizationError = await requireAuthorization(request, env);

  if (authorizationError) {
    return authorizationError;
  }

  let payload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      {
        success: false,
        error: "Invalid JSON",
        message: "Не удалось прочитать ссылку.",
      },
      400
    );
  }

  let requestedUrl;

  try {
    requestedUrl = normalizeExternalUrl(payload?.url).href;
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: "Invalid URL",
        message: error instanceof Error ? error.message : "Некорректная ссылка.",
      },
      400
    );
  }

  let fetchResult;

  try {
    fetchResult = await fetchWithRedirects(requestedUrl, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
        "User-Agent": "Mozilla/5.0 (compatible; NataliaRecipeImporter/1.0)",
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: "Fetch failed",
        message: error instanceof Error ? error.message : "Не удалось открыть страницу.",
      },
      502
    );
  }

  const { response, finalUrl } = fetchResult;

  if (!response.ok) {
    return jsonResponse(
      {
        success: false,
        error: "Source returned an error",
        message: `Сайт вернул ошибку ${response.status}.`,
      },
      502
    );
  }

  const contentType = (response.headers.get("Content-Type") || "").toLowerCase();

  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    return jsonResponse(
      {
        success: false,
        error: "Unsupported page type",
        message: "По ссылке открывается не HTML-страница.",
      },
      415
    );
  }

  const declaredLength = Number(response.headers.get("Content-Length") || 0);

  if (declaredLength > MAX_HTML_BYTES) {
    return jsonResponse(
      {
        success: false,
        error: "Page too large",
        message: "Страница слишком большая для импорта.",
      },
      413
    );
  }

  const html = await response.text();

  if (textEncoder.encode(html).byteLength > MAX_HTML_BYTES) {
    return jsonResponse(
      {
        success: false,
        error: "Page too large",
        message: "Страница слишком большая для импорта.",
      },
      413
    );
  }

  const jsonLdValues = parseJsonLdBlocks(extractJsonLdBlocks(html));
  const recipeNode = findRecipeNode(jsonLdValues);

  if (!recipeNode) {
    return jsonResponse(
      {
        success: false,
        error: "Recipe markup not found",
        message:
          "На странице не найден структурированный блок Recipe. Этот сайт пока нельзя импортировать автоматически — вставьте рецепт вручную.",
        partial: {
          title: extractTitle(html),
          description: extractMeta(html, ["og:description", "description", "twitter:description"]),
          imageSourceUrl: resolveUrl(
            extractMeta(html, ["og:image", "twitter:image"]),
            finalUrl
          ),
          sourceUrl: finalUrl,
        },
      },
      422
    );
  }

  const recipe = parseRecipe(recipeNode, html, finalUrl);

  return jsonResponse({
    success: true,
    message: "Рецепт извлечён. Проверьте карточку перед сохранением.",
    item: recipe,
  });
}

function createImageKey(title, contentType) {
  const extension = ALLOWED_IMAGE_TYPES.get(contentType);
  const baseName = slugify(title) || "recipe";
  const uniquePart = crypto.randomUUID().slice(0, 12);

  return `recipes/imported/${baseName}-${uniquePart}.${extension}`;
}

async function importImage(request, env) {
  const authorizationError = await requireAuthorization(request, env);

  if (authorizationError) {
    return authorizationError;
  }

  let payload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      {
        success: false,
        error: "Invalid JSON",
        message: "Не удалось прочитать данные изображения.",
      },
      400
    );
  }

  let imageUrl;

  try {
    imageUrl = normalizeExternalUrl(payload?.url).href;
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: "Invalid image URL",
        message: error instanceof Error ? error.message : "Некорректная ссылка на изображение.",
      },
      400
    );
  }

  let fetchResult;

  try {
    fetchResult = await fetchWithRedirects(imageUrl, {
      method: "GET",
      headers: {
        Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8,*/*;q=0.2",
        Referer: stringOrNull(payload?.sourceUrl) || imageUrl,
        "User-Agent": "Mozilla/5.0 (compatible; NataliaRecipeImporter/1.0)",
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: "Image fetch failed",
        message: error instanceof Error ? error.message : "Не удалось скачать изображение.",
      },
      502
    );
  }

  const { response, finalUrl } = fetchResult;

  if (!response.ok) {
    return jsonResponse(
      {
        success: false,
        error: "Image source returned an error",
        message: `Источник изображения вернул ошибку ${response.status}.`,
      },
      502
    );
  }

  const contentType = (response.headers.get("Content-Type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return jsonResponse(
      {
        success: false,
        error: "Unsupported image type",
        message: "Можно сохранить только JPG, PNG или WebP.",
      },
      415
    );
  }

  const declaredLength = Number(response.headers.get("Content-Length") || 0);

  if (declaredLength > MAX_IMAGE_BYTES) {
    return jsonResponse(
      {
        success: false,
        error: "Image too large",
        message: "Изображение превышает 8 МБ.",
      },
      413
    );
  }

  const bytes = await response.arrayBuffer();

  if (!bytes.byteLength) {
    return jsonResponse(
      {
        success: false,
        error: "Empty image",
        message: "Источник вернул пустой файл.",
      },
      400
    );
  }

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return jsonResponse(
      {
        success: false,
        error: "Image too large",
        message: "Изображение превышает 8 МБ.",
      },
      413
    );
  }

  const title = stringOrNull(payload?.title) || "recipe";
  const key = createImageKey(title, contentType);

  await env.IMAGES.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      importedFrom: finalUrl.slice(0, 1000),
      sourcePage: stringOrNull(payload?.sourceUrl)?.slice(0, 1000) || "",
      uploadedAt: new Date().toISOString(),
    },
  });

  const imageKey = `/images/${key}`;

  return jsonResponse(
    {
      success: true,
      message: "Изображение сохранено в R2.",
      item: {
        key,
        imageKey,
        contentType,
        size: bytes.byteLength,
        sourceUrl: finalUrl,
      },
    },
    201
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return jsonResponse({
          success: true,
          service: "recepty-importer",
          images: Boolean(env.IMAGES),
        });
      }

      if (request.method === "POST" && url.pathname === "/api/import/preview") {
        return previewImport(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/import/image") {
        return importImage(request, env);
      }

      return jsonResponse(
        {
          success: false,
          error: "Route not found",
        },
        404
      );
    } catch (error) {
      console.error(error);

      return jsonResponse(
        {
          success: false,
          error: "Importer failed",
          message: "Импорт завершился с ошибкой.",
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  },
};
