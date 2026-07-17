const textEncoder = new TextEncoder();

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
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

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(
    typeof value === "string"
      ? value.replace(",", ".")
      : value
  );

  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = numberOrNull(value);

  if (number === null) {
    return null;
  }

  return Math.max(0, Math.round(number));
}

function booleanToInteger(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  )
    ? 1
    : 0;
}

function normalizeForComparison(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ");
}

function transliterate(value) {
  const map = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "yo",
    ж: "zh",
    з: "z",
    и: "i",
    й: "j",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "c",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
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

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error(
        "Допустимы только ссылки http и https."
      );
    }

    return url.href;
  } catch {
    throw new Error(`Некорректная ссылка: ${text}`);
  }
}

function normalizeNamedList(values) {
  const source = Array.isArray(values)
    ? values
    : values
      ? [values]
      : [];

  const result = [];
  const used = new Set();

  for (const item of source) {
    const name = stringOrNull(
      typeof item === "object" && item !== null
        ? item.name
        : item
    );

    if (!name) {
      continue;
    }

    const comparisonKey =
      normalizeForComparison(name);

    if (used.has(comparisonKey)) {
      continue;
    }

    used.add(comparisonKey);
    result.push(name);
  }

  return result;
}

function composeIngredientText(ingredient) {
  const {
    name,
    amount,
    amountMin,
    amountMax,
    unit,
  } = ingredient;

  let quantity = "";

  if (
    amountMin !== null &&
    amountMax !== null
  ) {
    quantity = `${amountMin}–${amountMax}`;
  } else if (amount !== null) {
    quantity = String(amount);
  }

  const quantityWithUnit = [
    quantity,
    unit,
  ]
    .filter(Boolean)
    .join(" ");

  return quantityWithUnit
    ? `${name} — ${quantityWithUnit}`
    : name;
}

function normalizeIngredients(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .slice(0, 200)
    .map((item, index) => {
      if (typeof item === "string") {
        const rawText = item.trim();

        return {
          position: index + 1,
          section: null,
          name:
            rawText
              .split(/\s+[—–-]\s+/)[0]
              ?.trim() || rawText,
          amount: null,
          amountMin: null,
          amountMax: null,
          unit: null,
          rawText,
        };
      }

      if (
        !item ||
        typeof item !== "object"
      ) {
        return null;
      }

      const rawText = stringOrNull(
        item.rawText ?? item.raw_text
      );

      const name =
        stringOrNull(item.name) ||
        rawText
          ?.split(/\s+[—–-]\s+/)[0]
          ?.trim() ||
        null;

      if (!name) {
        return null;
      }

      const ingredient = {
        position:
          integerOrNull(item.position) ||
          index + 1,

        section:
          stringOrNull(item.section),

        name,

        amount:
          numberOrNull(item.amount),

        amountMin:
          numberOrNull(
            item.amountMin ??
            item.amount_min
          ),

        amountMax:
          numberOrNull(
            item.amountMax ??
            item.amount_max
          ),

        unit:
          stringOrNull(item.unit),

        rawText: "",
      };

      ingredient.rawText =
        rawText ||
        composeIngredientText(ingredient);

      return ingredient;
    })
    .filter(Boolean)
    .sort(
      (first, second) =>
        first.position - second.position
    );
}

function normalizeSteps(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .slice(0, 100)
    .map((item, index) => {
      if (typeof item === "string") {
        const instruction = item.trim();

        if (!instruction) {
          return null;
        }

        return {
          position: index + 1,
          section: null,
          instruction,
        };
      }

      if (
        !item ||
        typeof item !== "object"
      ) {
        return null;
      }

      const instruction = stringOrNull(
        item.instruction ?? item.text
      );

      if (!instruction) {
        return null;
      }

      return {
        position:
          integerOrNull(item.position) ||
          index + 1,

        section:
          stringOrNull(item.section),

        instruction,
      };
    })
    .filter(Boolean)
    .sort(
      (first, second) =>
        first.position - second.position
    );
}

async function secureCompare(
  provided,
  expected
) {
  const [
    providedHash,
    expectedHash,
  ] = await Promise.all([
    crypto.subtle.digest(
      "SHA-256",
      textEncoder.encode(provided)
    ),

    crypto.subtle.digest(
      "SHA-256",
      textEncoder.encode(expected)
    ),
  ]);

  return crypto.subtle.timingSafeEqual(
    providedHash,
    expectedHash
  );
}

async function isAuthorized(
  request,
  env
) {
  if (!env.ADMIN_API_KEY) {
    return false;
  }

  const authorization =
    request.headers.get("Authorization") ||
    "";

  if (
    !authorization.startsWith("Bearer ")
  ) {
    return false;
  }

  const providedKey = authorization
    .slice("Bearer ".length)
    .trim();

  if (!providedKey) {
    return false;
  }

  return secureCompare(
    providedKey,
    String(env.ADMIN_API_KEY)
  );
}

async function requireAuthorization(
  request,
  env
) {
  const authorized =
    await isAuthorized(request, env);

  if (authorized) {
    return null;
  }

  return jsonResponse(
    {
      success: false,
      error: "Unauthorized",
      message:
        "Для выполнения этой команды нужен ключ редактора.",
    },
    401
  );
}

function createImageKey(
  title,
  contentType
) {
  const extension =
    ALLOWED_IMAGE_TYPES.get(contentType);

  const baseName =
    slugify(title) || "recipe";

  const uniquePart =
    crypto.randomUUID().slice(0, 12);

  return (
    `recipes/${baseName}-` +
    `${uniquePart}.${extension}`
  );
}

async function uploadImage(
  request,
  env,
  url
) {
  const authorizationError =
    await requireAuthorization(
      request,
      env
    );

  if (authorizationError) {
    return authorizationError;
  }

  const contentType =
    request.headers.get("Content-Type") ||
    "";

  if (
    !contentType
      .toLowerCase()
      .startsWith("multipart/form-data")
  ) {
    return jsonResponse(
      {
        success: false,
        error: "Invalid content type",
        message:
          "Фотография должна быть отправлена как multipart/form-data.",
      },
      415
    );
  }

  let formData;

  try {
    formData =
      await request.formData();
  } catch {
    return jsonResponse(
      {
        success: false,
        error: "Invalid form data",
        message:
          "Не удалось прочитать загружаемый файл.",
      },
      400
    );
  }

  const file =
    formData.get("image");

  if (!(file instanceof File)) {
    return jsonResponse(
      {
        success: false,
        error: "Image missing",
        message:
          "Выберите фотографию в поле с именем image.",
      },
      400
    );
  }

  if (
    !ALLOWED_IMAGE_TYPES.has(file.type)
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Unsupported image type",
        message:
          "Поддерживаются только JPG, PNG и WebP.",
      },
      415
    );
  }

  if (file.size <= 0) {
    return jsonResponse(
      {
        success: false,
        error: "Empty image",
        message:
          "Загруженный файл пуст.",
      },
      400
    );
  }

  if (
    file.size > MAX_IMAGE_BYTES
  ) {
    return jsonResponse(
      {
        success: false,
        error: "Image too large",
        message:
          "Размер фотографии не должен превышать 8 МБ.",
      },
      413
    );
  }

  const title =
    stringOrNull(
      formData.get("title")
    ) ||
    file.name.replace(/\.[^.]+$/, "") ||
    "recipe";

  const key =
    createImageKey(title, file.type);

  try {
    await env.IMAGES.put(
      key,
      file.stream(),
      {
        httpMetadata: {
          contentType: file.type,
          cacheControl:
            "public, max-age=31536000, immutable",
        },

        customMetadata: {
          originalName:
            file.name.slice(0, 200),

          uploadedAt:
            new Date().toISOString(),
        },
      }
    );
  } catch (error) {
    console.error(
      "Image upload failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error: "Image upload failed",
        message:
          "Не удалось сохранить фотографию в хранилище.",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }

  const imagePath =
    `/images/${key}`;

  return jsonResponse(
    {
      success: true,
      message:
        "Фотография загружена.",

      item: {
        key,
        imageKey: imagePath,

        url: new URL(
          imagePath,
          url.origin
        ).href,

        contentType: file.type,
        size: file.size,
      },
    },
    201
  );
}

async function serveImage(
  request,
  env,
  url
) {
  const encodedKey =
    url.pathname.slice(
      "/images/".length
    );

  if (!encodedKey) {
    return jsonResponse(
      {
        success: false,
        error: "Image not found",
      },
      404
    );
  }

  let key;

  try {
    key =
      decodeURIComponent(encodedKey);
  } catch {
    return jsonResponse(
      {
        success: false,
        error: "Invalid image path",
      },
      400
    );
  }

  if (
    key.length > 500 ||
    key.includes("\0") ||
    key.startsWith("/")
  ) {
    return jsonResponse(
      {
        success: false,
        error: "Invalid image path",
      },
      400
    );
  }

  const object =
    await env.IMAGES.get(key);

  if (!object) {
    return jsonResponse(
      {
        success: false,
        error: "Image not found",
      },
      404
    );
  }

  const requestEtag =
    request.headers.get("If-None-Match");

  if (
    requestEtag &&
    requestEtag === object.httpEtag
  ) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: object.httpEtag,
      },
    });
  }

  const headers = new Headers();

  object.writeHttpMetadata(headers);

  headers.set(
    "ETag",
    object.httpEtag
  );

  headers.set(
    "X-Content-Type-Options",
    "nosniff"
  );

  if (
    !headers.has("Cache-Control")
  ) {
    headers.set(
      "Cache-Control",
      "public, max-age=31536000, immutable"
    );
  }

  return new Response(
    request.method === "HEAD"
      ? null
      : object.body,
    {
      status: 200,
      headers,
    }
  );
}

async function createUniqueSlug(
  database,
  requestedSlug,
  title
) {
  const baseSlug =
    slugify(
      requestedSlug || title
    ) ||
    `recipe-${
      crypto.randomUUID().slice(0, 8)
    }`;

  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing =
      await database
        .prepare(`
          SELECT id
          FROM recipes
          WHERE slug = ?
          LIMIT 1
        `)
        .bind(slug)
        .first();

    if (!existing) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;

    if (suffix > 100) {
      return (
        `${baseSlug}-` +
        crypto
          .randomUUID()
          .slice(0, 8)
      );
    }
  }
}

async function findDuplicateRecipe(
  database,
  title,
  sourceUrl
) {
  const result =
    await database
      .prepare(`
        SELECT
          id,
          slug,
          title,
          source_url
        FROM recipes
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
      `)
      .all();

  const normalizedTitle =
    normalizeForComparison(title);

  const duplicateByTitle =
    (result.results ?? []).find(
      (recipe) =>
        normalizeForComparison(
          recipe.title
        ) === normalizedTitle
    );

  if (duplicateByTitle) {
    return duplicateByTitle;
  }

  if (sourceUrl) {
    const duplicateBySource =
      (result.results ?? []).find(
        (recipe) =>
          recipe.source_url ===
          sourceUrl
      );

    if (duplicateBySource) {
      return duplicateBySource;
    }
  }

  return null;
}

async function searchRecipes(
  request,
  env,
  url
) {
  const authorizationError =
    await requireAuthorization(
      request,
      env
    );

  if (authorizationError) {
    return authorizationError;
  }

  const query =
    normalizeForComparison(
      url.searchParams.get("query")
    );

  if (!query) {
    return jsonResponse({
      success: true,
      items: [],
    });
  }

  const result =
    await env.DB
      .prepare(`
        SELECT
          id,
          slug,
          title,
          description,
          source_url,
          updated_at
        FROM recipes
        WHERE deleted_at IS NULL
        ORDER BY title COLLATE NOCASE
      `)
      .all();

  const items =
    (result.results ?? [])
      .filter((recipe) => {
        const searchableText =
          normalizeForComparison(
            [
              recipe.title,
              recipe.description,
              recipe.source_url,
            ].join(" ")
          );

        return searchableText
          .includes(query);
      })
      .slice(0, 20)
      .map((recipe) => ({
        ...recipe,

        url:
          `${url.origin}/recipe?slug=` +
          encodeURIComponent(
            recipe.slug
          ),
      }));

  return jsonResponse({
    success: true,
    items,
  });
}

async function createRecipe(
  request,
  env,
  url
) {
  const authorizationError =
    await requireAuthorization(
      request,
      env
    );

  if (authorizationError) {
    return authorizationError;
  }

  const contentLength =
    Number(
      request.headers.get(
        "Content-Length"
      ) || 0
    );

  if (
    contentLength > 1_000_000
  ) {
    return jsonResponse(
      {
        success: false,
        error: "Payload too large",
        message:
          "Размер данных рецепта превышает 1 МБ.",
      },
      413
    );
  }

  let payload;

  try {
    payload =
      await request.json();
  } catch {
    return jsonResponse(
      {
        success: false,
        error: "Invalid JSON",
        message:
          "Сервер не смог прочитать данные рецепта.",
      },
      400
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return jsonResponse(
      {
        success: false,
        error: "Invalid recipe",
        message:
          "Данные рецепта должны быть объектом.",
      },
      400
    );
  }

  const title =
    stringOrNull(payload.title);

  if (!title) {
    return jsonResponse(
      {
        success: false,
        error: "Validation failed",

        fields: {
          title:
            "Укажите название рецепта.",
        },
      },
      400
    );
  }

  if (title.length > 200) {
    return jsonResponse(
      {
        success: false,
        error: "Validation failed",

        fields: {
          title:
            "Название не должно превышать 200 символов.",
        },
      },
      400
    );
  }

  const ingredients =
    normalizeIngredients(
      payload.ingredients
    );

  const steps =
    normalizeSteps(payload.steps);

  const validationFields = {};

  if (!ingredients.length) {
    validationFields.ingredients =
      "Добавьте хотя бы один ингредиент.";
  }

  if (!steps.length) {
    validationFields.steps =
      "Добавьте хотя бы один шаг приготовления.";
  }

  if (
    Object.keys(validationFields)
      .length
  ) {
    return jsonResponse(
      {
        success: false,
        error: "Validation failed",
        fields: validationFields,
      },
      400
    );
  }

  let sourceUrl;
  let imageSourceUrl;

  try {
    sourceUrl =
      normalizeHttpUrl(
        payload.sourceUrl ??
        payload.source_url
      );

    imageSourceUrl =
      normalizeHttpUrl(
        payload.imageSourceUrl ??
        payload.image_source_url
      );
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: "Validation failed",

        message:
          error instanceof Error
            ? error.message
            : "Некорректная ссылка.",
      },
      400
    );
  }

  const duplicate =
    await findDuplicateRecipe(
      env.DB,
      title,
      sourceUrl
    );

  if (duplicate) {
    return jsonResponse(
      {
        success: false,
        error: "Duplicate recipe",

        message:
          "В книге уже есть рецепт с таким названием или источником.",

        existing: {
          id: duplicate.id,
          title: duplicate.title,
          slug: duplicate.slug,

          url:
            `${url.origin}/recipe?slug=` +
            encodeURIComponent(
              duplicate.slug
            ),
        },
      },
      409
    );
  }

  const id =
    crypto.randomUUID();

  const slug =
    await createUniqueSlug(
      env.DB,
      payload.slug,
      title
    );

  const categories =
    normalizeNamedList([
      ...(
        Array.isArray(
          payload.categories
        )
          ? payload.categories
          : []
      ),

      ...(
        payload.category
          ? [payload.category]
          : []
      ),
    ]);

  if (!categories.length) {
    categories.push(
      "Без категории"
    );
  }

  const tags =
    normalizeNamedList(
      payload.tags
    );

  const recipeValues = [
    id,
    slug,
    title,
    stringOrNull(
      payload.description
    ),

    numberOrNull(
      payload.servings
    ),

    stringOrNull(
      payload.servingsText ??
      payload.servings_text
    ),

    numberOrNull(
      payload.servingsMin ??
      payload.servings_min
    ),

    numberOrNull(
      payload.servingsMax ??
      payload.servings_max
    ),

    integerOrNull(
      payload.prepMinutes ??
      payload.prep_minutes
    ),

    integerOrNull(
      payload.cookMinutes ??
      payload.cook_minutes
    ),

    integerOrNull(
      payload.totalMinutes ??
      payload.total_minutes
    ),

    stringOrNull(
      payload.sourceName ??
      payload.source_name
    ),

    sourceUrl,

    stringOrNull(
      payload.imageKey ??
      payload.image_key
    ),

    imageSourceUrl,

    stringOrNull(
      payload.imageCredit ??
      payload.image_credit
    ),

    stringOrNull(
      payload.tips
    ),

    stringOrNull(
      payload.serveWith ??
      payload.serve_with
    ),

    stringOrNull(
      payload.notes
    ),

    stringOrNull(
      payload.batchTip ??
      payload.batch_tip
    ),

    stringOrNull(
      payload.highlight
    ),

    stringOrNull(
      payload.nutritionBasis ??
      payload.nutrition_basis
    ),

    numberOrNull(
      payload.caloriesKcal ??
      payload.calories_kcal
    ),

    numberOrNull(
      payload.proteinG ??
      payload.protein_g
    ),

    numberOrNull(
      payload.fatG ??
      payload.fat_g
    ),

    numberOrNull(
      payload.carbsG ??
      payload.carbs_g
    ),

    booleanToInteger(
      payload.isVerified ??
      payload.is_verified
    ),

    booleanToInteger(
      payload.isWeeklyPrep ??
      payload.is_weekly_prep
    ),

    booleanToInteger(
      payload.isFavorite ??
      payload.is_favorite
    ),

    null,
  ];

  const statements = [];

  statements.push(
    env.DB
      .prepare(`
        INSERT INTO recipes (
          id,
          slug,
          title,
          description,

          servings,
          servings_text,
          servings_min,
          servings_max,

          prep_minutes,
          cook_minutes,
          total_minutes,

          source_name,
          source_url,

          image_key,
          image_source_url,
          image_credit,

          tips,
          serve_with,
          notes,
          batch_tip,
          highlight,

          nutrition_basis,
          calories_kcal,
          protein_g,
          fat_g,
          carbs_g,

          is_verified,
          is_weekly_prep,
          is_favorite,

          reset_box_exported_at,

          created_at,
          updated_at,
          deleted_at
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
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          NULL
        )
      `)
      .bind(...recipeValues)
  );

  for (
    const ingredient
    of ingredients
  ) {
    statements.push(
      env.DB
        .prepare(`
          INSERT INTO ingredients (
            recipe_id,
            position,
            section,
            name,
            amount,
            amount_min,
            amount_max,
            unit,
            raw_text
          )
          VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?
          )
        `)
        .bind(
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
      env.DB
        .prepare(`
          INSERT INTO steps (
            recipe_id,
            position,
            section,
            instruction
          )
          VALUES (?, ?, ?, ?)
        `)
        .bind(
          id,
          step.position,
          step.section,
          step.instruction
        )
    );
  }

  for (
    const categoryName
    of categories.slice(0, 20)
  ) {
    const categorySlug =
      slugify(categoryName) ||
      `category-${
        crypto
          .randomUUID()
          .slice(0, 8)
      }`;

    statements.push(
      env.DB
        .prepare(`
          INSERT OR IGNORE
          INTO categories (
            name,
            slug
          )
          VALUES (?, ?)
        `)
        .bind(
          categoryName,
          categorySlug
        )
    );

    statements.push(
      env.DB
        .prepare(`
          INSERT OR IGNORE
          INTO recipe_categories (
            recipe_id,
            category_id
          )
          SELECT ?, id
          FROM categories
          WHERE slug = ?
        `)
        .bind(
          id,
          categorySlug
        )
    );
  }

  for (
    const tagName
    of tags.slice(0, 30)
  ) {
    const tagSlug =
      slugify(tagName) ||
      `tag-${
        crypto
          .randomUUID()
          .slice(0, 8)
      }`;

    statements.push(
      env.DB
        .prepare(`
          INSERT OR IGNORE
          INTO tags (
            name,
            slug
          )
          VALUES (?, ?)
        `)
        .bind(
          tagName,
          tagSlug
        )
    );

    statements.push(
      env.DB
        .prepare(`
          INSERT OR IGNORE
          INTO recipe_tags (
            recipe_id,
            tag_id
          )
          SELECT ?, id
          FROM tags
          WHERE slug = ?
        `)
        .bind(
          id,
          tagSlug
        )
    );
  }

  try {
    await env.DB.batch(
      statements
    );
  } catch (error) {
    console.error(
      "Recipe creation failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          "Database write failed",

        message:
          "Не удалось сохранить рецепт в базе.",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }

  return jsonResponse(
    {
      success: true,
      message:
        "Рецепт добавлен в книгу.",

      item: {
        id,
        slug,
        title,

        url:
          `${url.origin}/recipe?slug=` +
          encodeURIComponent(slug),
      },
    },
    201
  );
}

async function getRecipeCatalog(
  env
) {
  const result =
    await env.DB
      .prepare(`
        SELECT
          r.id,
          r.slug,
          r.title,
          r.description,

          r.servings,
          r.servings_text,
          r.servings_min,
          r.servings_max,

          r.prep_minutes,
          r.cook_minutes,
          r.total_minutes,

          r.source_name,
          r.source_url,

          r.image_key,

          r.is_verified,
          r.is_weekly_prep,
          r.is_favorite,

          r.created_at,
          r.updated_at,

          COALESCE(
            (
              SELECT c.name
              FROM categories c
              INNER JOIN recipe_categories rc
                ON rc.category_id = c.id
              WHERE rc.recipe_id = r.id
              ORDER BY c.name COLLATE NOCASE
              LIMIT 1
            ),
            'Без категории'
          ) AS category,

          COALESCE(
            (
              SELECT GROUP_CONCAT(
                t.name,
                '|||'
              )
              FROM tags t
              INNER JOIN recipe_tags rt
                ON rt.tag_id = t.id
              WHERE rt.recipe_id = r.id
            ),
            ''
          ) AS tags_text

        FROM recipes r

        WHERE r.deleted_at IS NULL

        ORDER BY
          r.title COLLATE NOCASE
      `)
      .all();

  const items =
    (result.results ?? [])
      .map(
        ({
          tags_text,
          ...recipe
        }) => ({
          ...recipe,

          tags: tags_text
            ? tags_text
                .split("|||")
                .filter(Boolean)
            : [],
        })
      );

  return jsonResponse({
    success: true,
    items,
  });
}

async function getFullRecipe(
  env,
  slug
) {
  const recipe =
    await env.DB
      .prepare(`
        SELECT
          id,
          slug,
          title,
          description,

          servings,
          servings_text,
          servings_min,
          servings_max,

          prep_minutes,
          cook_minutes,
          total_minutes,

          source_name,
          source_url,

          image_key,
          image_source_url,
          image_credit,

          tips,
          serve_with,
          notes,
          batch_tip,
          highlight,

          nutrition_basis,
          calories_kcal,
          protein_g,
          fat_g,
          carbs_g,

          is_verified,
          is_weekly_prep,
          is_favorite,

          created_at,
          updated_at

        FROM recipes

        WHERE slug = ?
          AND deleted_at IS NULL

        LIMIT 1
      `)
      .bind(slug)
      .first();

  if (!recipe) {
    return jsonResponse(
      {
        success: false,
        error: "Recipe not found",
      },
      404
    );
  }

  const [
    ingredientsResult,
    stepsResult,
    categoriesResult,
    tagsResult,
  ] = await Promise.all([
    env.DB
      .prepare(`
        SELECT
          id,
          position,
          section,
          name,
          amount,
          amount_min,
          amount_max,
          unit,
          raw_text
        FROM ingredients
        WHERE recipe_id = ?
        ORDER BY position
      `)
      .bind(recipe.id)
      .all(),

    env.DB
      .prepare(`
        SELECT
          id,
          position,
          section,
          instruction
        FROM steps
        WHERE recipe_id = ?
        ORDER BY position
      `)
      .bind(recipe.id)
      .all(),

    env.DB
      .prepare(`
        SELECT
          c.id,
          c.name,
          c.slug
        FROM categories c
        INNER JOIN recipe_categories rc
          ON rc.category_id = c.id
        WHERE rc.recipe_id = ?
        ORDER BY c.name COLLATE NOCASE
      `)
      .bind(recipe.id)
      .all(),

    env.DB
      .prepare(`
        SELECT
          t.id,
          t.name,
          t.slug
        FROM tags t
        INNER JOIN recipe_tags rt
          ON rt.tag_id = t.id
        WHERE rt.recipe_id = ?
        ORDER BY t.name COLLATE NOCASE
      `)
      .bind(recipe.id)
      .all(),
  ]);

  return jsonResponse({
    success: true,

    item: {
      ...recipe,

      ingredients:
        ingredientsResult.results ??
        [],

      steps:
        stepsResult.results ??
        [],

      categories:
        categoriesResult.results ??
        [],

      tags:
        tagsResult.results ??
        [],
    },
  });
}

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);

    try {
      if (
        ["GET", "HEAD"].includes(
          request.method
        ) &&
        url.pathname.startsWith(
          "/images/"
        )
      ) {
        return serveImage(
          request,
          env,
          url
        );
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/health"
      ) {
        const result =
          await env.DB
            .prepare(
              "SELECT 1 AS ok"
            )
            .first();

        return jsonResponse({
          success:
            result?.ok === 1,

          database:
            "recepty-db",

          images:
            Boolean(env.IMAGES),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname ===
          "/api/recipes"
      ) {
        return getRecipeCatalog(env);
      }

      if (
        request.method === "GET" &&
        (
          url.pathname ===
            "/api/admin/recipes/search" ||
          url.pathname ===
            "/api/assistant/recipes/search"
        )
      ) {
        return searchRecipes(
          request,
          env,
          url
        );
      }

      if (
        request.method === "POST" &&
        (
          url.pathname ===
            "/api/admin/images" ||
          url.pathname ===
            "/api/assistant/images"
        )
      ) {
        return uploadImage(
          request,
          env,
          url
        );
      }

      if (
        request.method === "POST" &&
        (
          url.pathname ===
            "/api/admin/recipes" ||
          url.pathname ===
            "/api/assistant/recipes"
        )
      ) {
        return createRecipe(
          request,
          env,
          url
        );
      }

      const recipeMatch =
        url.pathname.match(
          /^\/api\/recipes\/([^/]+)$/
        );

      if (
        request.method === "GET" &&
        recipeMatch
      ) {
        const slug =
          decodeURIComponent(
            recipeMatch[1]
          );

        return getFullRecipe(
          env,
          slug
        );
      }

      if (
        url.pathname.startsWith(
          "/api/"
        )
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "API route not found",
          },
          404
        );
      }

      return env.ASSETS.fetch(
        request
      );
    } catch (error) {
      console.error(error);

      return jsonResponse(
        {
          success: false,
          error:
            "Server request failed",

          details:
            error instanceof Error
              ? error.message
              : String(error),
        },
        500
      );
    }
  },
};
