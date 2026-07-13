const loading = document.querySelector("#recipe-loading");
const errorBlock = document.querySelector("#recipe-error");
const errorText = document.querySelector("#recipe-error-text");
const content = document.querySelector("#recipe-content");

const slug = new URLSearchParams(window.location.search).get("slug");

function showError(message) {
  loading.hidden = true;
  content.hidden = true;
  errorText.textContent = message;
  errorBlock.hidden = false;
}

function formatMinutes(value) {
  const minutes = Number(value);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "";
  }

  if (minutes < 60) {
    return `${minutes} мин`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (!remainder) {
    return `${hours} ч`;
  }

  return `${hours} ч ${remainder} мин`;
}

function imageUrl(imageKey) {
  if (!imageKey) {
    return "";
  }

  if (
    imageKey.startsWith("http://") ||
    imageKey.startsWith("https://") ||
    imageKey.startsWith("/")
  ) {
    return imageKey;
  }

  return `/${imageKey}`;
}

function groupBySection(items) {
  const groups = [];
  let currentGroup = null;

  for (const item of items) {
    const section = item.section || "";

    if (!currentGroup || currentGroup.section !== section) {
      currentGroup = {
        section,
        items: [],
      };

      groups.push(currentGroup);
    }

    currentGroup.items.push(item);
  }

  return groups;
}

function createTextList(value) {
  const list = document.createElement("ul");

  const items = String(value)
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const text of items) {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  }

  return list;
}

function renderIngredients(items) {
  const container = document.querySelector("#ingredients");
  container.replaceChildren();

  for (const group of groupBySection(items)) {
    if (group.section) {
      const heading = document.createElement("h3");
      heading.textContent = group.section;
      container.append(heading);
    }

    const list = document.createElement("ul");

    for (const ingredient of group.items) {
      const li = document.createElement("li");

      li.setAttribute("itemprop", "recipeIngredient");
      li.textContent = ingredient.raw_text || ingredient.name;

      list.append(li);
    }

    container.append(list);
  }
}

function renderSteps(items) {
  const container = document.querySelector("#steps");
  container.replaceChildren();

  let visibleNumber = 0;
  let component = null;
  let activeSection = null;

  for (const step of items) {
    /*
     * Шаги с заполненным section показываются
     * как вложенный ненумерованный блок.
     *
     * Например:
     *
     * Клёцки
     * Приготовить тесто...
     * Опустить тесто в суп...
     */
    if (step.section) {
      if (!component || activeSection !== step.section) {
        component = document.createElement("div");
        component.className = "component";

        const heading = document.createElement("h3");
        heading.textContent = step.section;

        component.append(heading);
        container.append(component);

        activeSection = step.section;
      }

      const paragraph = document.createElement("p");
      paragraph.setAttribute("itemprop", "recipeInstructions");
      paragraph.textContent = step.instruction;

      component.append(paragraph);
      continue;
    }

    /*
     * Основные шаги получают собственную
     * последовательную нумерацию.
     */
    component = null;
    activeSection = null;
    visibleNumber += 1;

    const stepElement = document.createElement("div");
    stepElement.className = "step";
    stepElement.setAttribute("itemprop", "recipeInstructions");
    stepElement.setAttribute("itemscope", "");
    stepElement.setAttribute(
      "itemtype",
      "https://schema.org/HowToStep"
    );

    const number = document.createElement("div");
    number.className = "step-number";
    number.textContent = visibleNumber;

    const text = document.createElement("p");
    text.setAttribute("itemprop", "text");
    text.textContent = step.instruction;

    stepElement.append(number, text);
    container.append(stepElement);
  }
}

function renderTags(tags) {
  const container = document.querySelector("#recipe-tags");
  container.replaceChildren();

  for (const tag of tags) {
    const link = document.createElement("a");

    link.className = "tag";
    link.href = `/?tag=${encodeURIComponent(tag.name)}`;
    link.textContent = tag.name;

    container.append(link);
  }
}

function renderOptionalList(blockId, containerId, value) {
  if (!value) {
    return;
  }

  const block = document.querySelector(blockId);
  const container = document.querySelector(containerId);

  container.replaceChildren(createTextList(value));
  block.hidden = false;
}

function renderOptionalText(blockId, elementId, value) {
  if (!value) {
    return;
  }

  document.querySelector(elementId).textContent = value;
  document.querySelector(blockId).hidden = false;
}

function renderNutrition(recipe) {
  const values = [
    ["Калории", recipe.calories_kcal, "ккал"],
    ["Белки", recipe.protein_g, "г"],
    ["Жиры", recipe.fat_g, "г"],
    ["Углеводы", recipe.carbs_g, "г"],
  ].filter(([, value]) => value !== null && value !== undefined);

  if (!values.length) {
    return;
  }

  const container = document.querySelector("#nutrition");
  container.replaceChildren();

  document.querySelector("#nutrition-basis").textContent =
    recipe.nutrition_basis || "";

  for (const [label, value, unit] of values) {
    const item = document.createElement("div");
    const strong = document.createElement("strong");

    strong.textContent =
      `${String(value).replace(".", ",")} ${unit}`;

    item.append(
      strong,
      document.createTextNode(label.toLowerCase())
    );

    container.append(item);
  }

  document.querySelector("#nutrition-block").hidden = false;
}

function renderSource(recipe) {
  if (!recipe.source_name && !recipe.source_url) {
    return;
  }

  const container = document.querySelector("#source");
  container.replaceChildren();

  if (recipe.source_url) {
    const link = document.createElement("a");

    link.href = recipe.source_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent =
      recipe.source_name || recipe.source_url;

    container.append(link);
  } else {
    container.textContent = recipe.source_name;
  }

  document.querySelector("#source-block").hidden = false;
}

function updateStructuredData(recipe) {
  const data = {
    "@context": "https://schema.org/",
    "@type": "Recipe",

    name: recipe.title,
    description: recipe.description || "",

    image: recipe.image_key
      ? [
          new URL(
            imageUrl(recipe.image_key),
            window.location.origin
          ).href,
        ]
      : undefined,

    recipeCategory:
      recipe.categories?.[0]?.name,

    keywords:
      recipe.tags
        ?.map((tag) => tag.name)
        .join(", "),

    totalTime:
      recipe.total_minutes
        ? `PT${recipe.total_minutes}M`
        : undefined,

    recipeYield:
      recipe.servings_text || undefined,

    recipeIngredient:
      recipe.ingredients?.map(
        (ingredient) => ingredient.raw_text
      ),

    recipeInstructions:
      recipe.steps?.map((step) => ({
        "@type": "HowToStep",
        position: step.position,
        name: step.section || undefined,
        text: step.instruction,
      })),
  };

  Object.keys(data).forEach((key) => {
    const value = data[key];

    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      delete data[key];
    }
  });

  document.querySelector("#recipe-jsonld").textContent =
    JSON.stringify(data);
}

function renderRecipe(recipe) {
  document.title =
    `${recipe.title} — Домашняя книга рецептов`;

  document
    .querySelector("#page-description")
    .setAttribute(
      "content",
      recipe.description || `Рецепт: ${recipe.title}`
    );

  document.querySelector("#recipe-title").textContent =
    recipe.title;

  document.querySelector("#recipe-description").textContent =
    recipe.description || "";

  document.querySelector("#recipe-category").textContent =
    recipe.categories?.[0]?.name || "Без категории";

  const cover = document.querySelector("#recipe-cover");

  if (recipe.image_key) {
    cover.src = imageUrl(recipe.image_key);
    cover.alt = recipe.title;
    cover.hidden = false;
  } else {
    cover.hidden = true;
  }

  const meta = document.querySelector("#recipe-meta");
  meta.replaceChildren();

  if (recipe.servings_text) {
    const servings = document.createElement("span");
    servings.textContent = `🍽 ${recipe.servings_text}`;
    meta.append(servings);
  }

  const timeText = formatMinutes(recipe.total_minutes);

  if (timeText) {
    const time = document.createElement("span");
    time.textContent = `⏱ ${timeText}`;
    meta.append(time);
  }

  renderTags(recipe.tags || []);
  renderIngredients(recipe.ingredients || []);
  renderSteps(recipe.steps || []);

  renderOptionalList(
    "#tips-block",
    "#tips",
    recipe.tips
  );

  renderOptionalList(
    "#serve-block",
    "#serve-with",
    recipe.serve_with
  );

  renderOptionalText(
    "#highlight-block",
    "#highlight",
    recipe.highlight
  );

  renderOptionalText(
    "#batch-block",
    "#batch-tip",
    recipe.batch_tip
  );

  renderOptionalText(
    "#notes-block",
    "#notes",
    recipe.notes
  );

  renderNutrition(recipe);
  renderSource(recipe);
  updateStructuredData(recipe);

  loading.hidden = true;
  errorBlock.hidden = true;
  content.hidden = false;
}

async function loadRecipe() {
  if (!slug) {
    showError(
      "В адресе страницы не указано название рецепта."
    );
    return;
  }

  try {
    const response = await fetch(
      `/api/recipes/${encodeURIComponent(slug)}`
    );

    const data = await response.json();

    if (!response.ok || !data.success || !data.item) {
      throw new Error(
        data.error || "Рецепт не найден"
      );
    }

    renderRecipe(data.item);
  } catch (error) {
    console.error(error);

    showError(
      error instanceof Error
        ? error.message
        : "Не удалось загрузить рецепт."
    );
  }
}

loadRecipe();
