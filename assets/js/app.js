const grid = document.querySelector("#recipe-grid");
const search = document.querySelector("#search");
const category = document.querySelector("#category");
const tagCloud = document.querySelector("#tag-cloud");
const empty = document.querySelector("#empty");

let recipes = [];

let activeTag =
  new URLSearchParams(window.location.search).get("tag") || "";

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]
  );
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

  if (remainder === 0) {
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

function recipeUrl(slug) {
  return `/recipe?slug=${encodeURIComponent(slug)}`;
}

function normalizeRecipe(recipe) {
  let servingsText = recipe.servings_text || "";

  if (!servingsText && recipe.servings) {
    servingsText = `${recipe.servings} порций`;
  }

  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title || "Без названия",
    description: recipe.description || "",
    category: recipe.category || "Без категории",
    tags: Array.isArray(recipe.tags) ? recipe.tags : [],
    image: imageUrl(recipe.image_key),
    time: formatMinutes(recipe.total_minutes),
    servings: servingsText,
    isVerified: Boolean(recipe.is_verified),
    isWeeklyPrep: Boolean(recipe.is_weekly_prep),
    isFavorite: Boolean(recipe.is_favorite),
  };
}

function renderTags() {
  const tags = [
    ...new Set(
      recipes.flatMap((recipe) => recipe.tags)
    ),
  ].sort((first, second) =>
    first.localeCompare(second, "ru")
  );

  const allTagsButton = `
    <button
      class="tag-button ${activeTag ? "" : "active"}"
      type="button"
      data-tag=""
    >
      Все метки
    </button>
  `;

  const tagButtons = tags
    .map(
      (tag) => `
        <button
          class="tag-button ${
            activeTag === tag ? "active" : ""
          }"
          type="button"
          data-tag="${escapeHtml(tag)}"
        >
          ${escapeHtml(tag)}
        </button>
      `
    )
    .join("");

  tagCloud.innerHTML = allTagsButton + tagButtons;

  tagCloud
    .querySelectorAll(".tag-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        activeTag = button.dataset.tag || "";

        const url = new URL(window.location.href);

        if (activeTag) {
          url.searchParams.set("tag", activeTag);
        } else {
          url.searchParams.delete("tag");
        }

        window.history.replaceState(null, "", url);

        renderTags();
        renderRecipes();
      });
    });
}

function createMetaHtml(recipe) {
  const items = [];

  if (recipe.time) {
    items.push(
      `<span>⏱ ${escapeHtml(recipe.time)}</span>`
    );
  }

  if (recipe.servings) {
    items.push(
      `<span>🍽 ${escapeHtml(recipe.servings)}</span>`
    );
  }

  return items.length
    ? `<div class="meta">${items.join("")}</div>`
    : "";
}

function createImageHtml(recipe) {
  if (!recipe.image) {
    return "";
  }

  return `
    <img
      src="${escapeHtml(recipe.image)}"
      alt="${escapeHtml(recipe.title)}"
      loading="lazy"
    >
  `;
}

function createStatusHtml(recipe) {
  const statuses = [];

  if (recipe.isVerified) {
    statuses.push(
      '<span class="tag">Проверено</span>'
    );
  }

  if (recipe.isWeeklyPrep) {
    statuses.push(
      '<span class="tag">Заготовки на неделю</span>'
    );
  }

  return statuses.length
    ? `<div class="recipe-tags">${statuses.join("")}</div>`
    : "";
}

function renderRecipes() {
  const query = search.value.trim().toLowerCase();
  const selectedCategory = category.value;

  const filteredRecipes = recipes.filter((recipe) => {
    const searchableText = [
      recipe.title,
      recipe.description,
      recipe.category,
      ...recipe.tags,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !query || searchableText.includes(query);

    const matchesCategory =
      !selectedCategory ||
      recipe.category === selectedCategory;

    const matchesTag =
      !activeTag || recipe.tags.includes(activeTag);

    return (
      matchesSearch &&
      matchesCategory &&
      matchesTag
    );
  });

  grid.innerHTML = filteredRecipes
    .map(
      (recipe) => `
        <article class="card">
          <a href="${escapeHtml(
            recipeUrl(recipe.slug)
          )}">
            ${createImageHtml(recipe)}

            <div class="card-body">
              <span class="category-pill">
                ${escapeHtml(recipe.category)}
              </span>

              <h2>${escapeHtml(recipe.title)}</h2>

              ${
                recipe.description
                  ? `
                    <p class="desc">
                      ${escapeHtml(recipe.description)}
                    </p>
                  `
                  : ""
              }

              ${createMetaHtml(recipe)}
              ${createStatusHtml(recipe)}
            </div>
          </a>
        </article>
      `
    )
    .join("");

  empty.hidden = filteredRecipes.length > 0;
}

function fillCategories() {
  const categories = [
    ...new Set(
      recipes.map((recipe) => recipe.category)
    ),
  ].sort((first, second) =>
    first.localeCompare(second, "ru")
  );

  category.innerHTML =
    '<option value="">Все категории</option>';

  for (const categoryName of categories) {
    category.add(
      new Option(categoryName, categoryName)
    );
  }
}

function showLoading() {
  grid.innerHTML = `
    <p>Загружаем рецепты…</p>
  `;

  empty.hidden = true;
}

function showError(message) {
  grid.innerHTML = `
    <section class="block">
      <h2>Не удалось загрузить рецепты</h2>
      <p>${escapeHtml(message)}</p>
      <button id="retry-load" type="button">
        Попробовать снова
      </button>
    </section>
  `;

  empty.hidden = true;

  document
    .querySelector("#retry-load")
    ?.addEventListener("click", loadRecipes);
}

async function loadRecipes() {
  showLoading();

  try {
    const response = await fetch("/api/recipes", {
      headers: {
        Accept: "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Сервер вернул ошибку."
      );
    }

    recipes = (data.items || []).map(
      normalizeRecipe
    );

    fillCategories();
    renderTags();
    renderRecipes();
  } catch (error) {
    console.error(error);

    showError(
      error instanceof Error
        ? error.message
        : "Неизвестная ошибка загрузки."
    );
  }
}

search.addEventListener("input", renderRecipes);
category.addEventListener("change", renderRecipes);

loadRecipes();
