const ADMIN_KEY_STORAGE = "receptyAdminKey";
const IMPORTER_ORIGIN = "https://recepty-importer.ninata911.workers.dev";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const TAXONOMY = window.ReceptyTaxonomy || {
  CATEGORIES: [],
  TAGS: [],
  suggestCategoryAndTags: () => ({ categories: [], tags: [] }),
};

const loginSection =
  document.querySelector("#login-section");

const editorSection =
  document.querySelector("#editor-section");

const loginForm =
  document.querySelector("#login-form");

const loginButton =
  document.querySelector("#login-button");

const loginStatus =
  document.querySelector("#login-status");

const keyInput =
  document.querySelector("#editor-key");

const logoutButton =
  document.querySelector("#logout-button");

const importForm =
  document.querySelector("#import-form");

const importUrlInput =
  document.querySelector("#import-url");

const importButton =
  document.querySelector("#import-button");

const importStatus =
  document.querySelector("#import-status");

const importPreview =
  document.querySelector("#import-preview");

const importPreviewImageWrap =
  document.querySelector("#import-preview-image-wrap");

const importPreviewImage =
  document.querySelector("#import-preview-image");

const importPreviewTitle =
  document.querySelector("#import-preview-title");

const importPreviewDescription =
  document.querySelector("#import-preview-description");

const importPreviewSource =
  document.querySelector("#import-preview-source");

const importPreviewMeta =
  document.querySelector("#import-preview-meta");

const importPreviewWarnings =
  document.querySelector("#import-preview-warnings");

const importPreviewIngredients =
  document.querySelector("#import-preview-ingredients");

const importPreviewSteps =
  document.querySelector("#import-preview-steps");

const importIngredientsHeading =
  document.querySelector("#import-ingredients-heading");

const importStepsHeading =
  document.querySelector("#import-steps-heading");

const importImageChoice =
  document.querySelector("#import-image-choice");

const importImageCheckbox =
  document.querySelector("#import-image-checkbox");

const applyImportButton =
  document.querySelector("#apply-import-button");

const cancelImportButton =
  document.querySelector("#cancel-import-button");

const recipeForm =
  document.querySelector("#recipe-form");

const categoryPickerElement =
  document.querySelector('#category-picker');

const tagPickerElement =
  document.querySelector('#tag-picker');

function createPicker(rootElement, options) {
  const allOptions = options.map((value) => ({ value, label: value }));

  const trigger =
    rootElement.querySelector("[data-picker-trigger]");
  const panel =
    rootElement.querySelector("[data-picker-panel]");
  const summary =
    rootElement.querySelector("[data-picker-summary]");
  const searchInput =
    rootElement.querySelector("[data-picker-search]");
  const clearButton =
    rootElement.querySelector("[data-picker-clear]");
  const optionsContainer =
    rootElement.querySelector("[data-picker-options]");

  const checkboxes = new Map();

  function buildOptions() {
    optionsContainer.replaceChildren();

    for (const option of allOptions) {
      const label = document.createElement("label");
      label.className = "picker-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = option.value;
      input.dataset.value = option.value;

      const text = document.createElement("span");
      text.textContent = option.label;

      label.append(input, text);
      optionsContainer.append(label);

      checkboxes.set(option.value, input);

      input.addEventListener("change", renderSummary);
    }
  }

  function renderSummary() {
    const selected = getSelected();

    summary.replaceChildren();

    if (!selected.length) {
      const placeholder = document.createElement("span");
      placeholder.className = "picker-placeholder";
      placeholder.textContent =
        rootElement.dataset.placeholder || "Выберите значения";
      summary.append(placeholder);
      clearButton.hidden = true;
      return;
    }

    summary.textContent = selected.join(", ");
    clearButton.hidden = false;
  }

  function getSelected() {
    const selected = [];

    for (const [value, input] of checkboxes) {
      if (input.checked) {
        selected.push(value);
      }
    }

    return selected;
  }

  function setSelected(values) {
    const normalized = new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value).trim())
        .filter(Boolean)
    );

    for (const [value, input] of checkboxes) {
      input.checked = normalized.has(value);
    }

    renderSummary();
  }

  function clear() {
    setSelected([]);
  }

  function filterOptions(query) {
    const normalizedQuery = query
      .trim()
      .toLocaleLowerCase("ru-RU");

    let anyVisible = false;

    for (const [value, input] of checkboxes) {
      const label = input.parentElement;
      const match =
        !normalizedQuery ||
        value.toLocaleLowerCase("ru-RU").includes(normalizedQuery);

      label.hidden = !match;

      if (match) {
        anyVisible = true;
      }
    }

    const existingEmpty =
      optionsContainer.querySelector(".picker-empty");

    if (!anyVisible && !existingEmpty) {
      const empty = document.createElement("p");
      empty.className = "picker-empty";
      empty.textContent = "Ничего не найдено.";
      optionsContainer.append(empty);
    } else if (anyVisible && existingEmpty) {
      existingEmpty.remove();
    }
  }

  function open() {
    panel.hidden = false;
    rootElement.dataset.open = "true";
    trigger.setAttribute("aria-expanded", "true");
    searchInput.value = "";
    filterOptions("");
    searchInput.focus();
  }

  function close() {
    panel.hidden = true;
    delete rootElement.dataset.open;
    trigger.setAttribute("aria-expanded", "false");
  }

  function toggle() {
    if (panel.hidden) {
      open();
    } else {
      close();
    }
  }

  function isOpen() {
    return !panel.hidden;
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    toggle();
  });

  searchInput.addEventListener("input", () => {
    filterOptions(searchInput.value);
  });

  clearButton.addEventListener("click", () => {
    clear();
  });

  document.addEventListener("click", (event) => {
    if (!isOpen()) {
      return;
    }

    if (!rootElement.contains(event.target)) {
      close();
    }
  });

  document.addEventListener("focusin", (event) => {
    if (!isOpen()) {
      return;
    }

    if (!rootElement.contains(event.target)) {
      close();
    }
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      trigger.focus();
    }
  });

  buildOptions();
  renderSummary();

  return {
    rootElement,
    getSelected,
    setSelected,
    clear,
    open,
    close,
  };
}

const categoryPicker =
  categoryPickerElement
    ? (categoryPickerElement.dataset.placeholder = "Выберите категории",
       createPicker(categoryPickerElement, TAXONOMY.CATEGORIES))
    : null;

const tagPicker =
  tagPickerElement
    ? (tagPickerElement.dataset.placeholder = "Выберите метки",
       createPicker(tagPickerElement, TAXONOMY.TAGS))
    : null;

const saveButton =
  document.querySelector("#save-button");

const resetButton =
  document.querySelector("#reset-button");

const saveStatus =
  document.querySelector("#save-status");

const imageInput =
  document.querySelector("#image-file");

const imageStatus =
  document.querySelector("#image-status");

const imagePreviewCard =
  document.querySelector("#image-preview-card");

const imagePreview =
  document.querySelector("#image-preview");

const imageFileInfo =
  document.querySelector("#image-file-info");

const removeImageButton =
  document.querySelector("#remove-image-button");

let previewObjectUrl = null;
let currentImport = null;
let importedImageSourceUrl = null;

function getStoredKey() {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
}

function storeKey(key) {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

function removeKey() {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

function showLogin() {
  loginSection.hidden = false;
  editorSection.hidden = true;
  keyInput.value = "";
  keyInput.focus();
}

function showEditor() {
  loginSection.hidden = true;
  editorSection.hidden = false;
}

function setStatus(element, message, type = "") {
  element.replaceChildren();
  element.textContent = message;
  element.className = "status-message";

  if (type) {
    element.classList.add(type);
  }

  element.hidden = false;
}

function hideStatus(element) {
  element.hidden = true;
  element.replaceChildren();
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 КБ";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} КБ`;
  }

  return `${(bytes / 1024 / 1024)
    .toFixed(2)
    .replace(".", ",")} МБ`;
}

function clearLocalImagePreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  imageInput.value = "";
}

function clearImagePreview() {
  clearLocalImagePreview();
  importedImageSourceUrl = null;
  imagePreview.removeAttribute("src");
  imageFileInfo.textContent = "";
  imagePreviewCard.hidden = true;
  hideStatus(imageStatus);
}

function validateImageFile(file) {
  if (!file) {
    return null;
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Поддерживаются только фотографии JPG, PNG и WebP.";
  }

  if (file.size <= 0) {
    return "Выбранный файл пуст.";
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return "Размер фотографии не должен превышать 8 МБ.";
  }

  return null;
}

function showImagePreview(file) {
  clearImagePreview();

  const validationError = validateImageFile(file);

  if (validationError) {
    setStatus(
      imageStatus,
      validationError,
      "error"
    );

    return;
  }

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  imageInput.files = dataTransfer.files;

  previewObjectUrl = URL.createObjectURL(file);

  imagePreview.src = previewObjectUrl;
  imageFileInfo.textContent =
    `${file.name} · ${formatFileSize(file.size)}`;

  imagePreviewCard.hidden = false;
}

function showImportedImagePreview(url) {
  clearImagePreview();

  if (!url) {
    return;
  }

  importedImageSourceUrl = url;
  imagePreview.src = url;
  imageFileInfo.textContent =
    "Фотография найдена на странице-источнике. При сохранении она будет скопирована в R2.";
  imagePreviewCard.hidden = false;
}

async function verifyKey(key) {
  const response = await fetch(
    "/api/admin/recipes/search?query=editor-check",
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
      },
    }
  );

  if (response.status === 401) {
    return false;
  }

  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => null);

    throw new Error(
      data?.message ||
      data?.error ||
      "Не удалось проверить ключ."
    );
  }

  return true;
}

function parseNumber(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const number = Number(
    String(value)
      .trim()
      .replace(",", ".")
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function parseNumericToken(value) {
  const text = String(value)
    .trim()
    .replace(",", ".");

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return Number(text);
  }

  const fraction = text.match(
    /^(\d+)\/(\d+)$/
  );

  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);

    if (denominator !== 0) {
      return numerator / denominator;
    }
  }

  return null;
}

function splitNameAndQuantity(line) {
  const match = line.match(
    /^(.*?)\s+[—–-]\s+(.+)$/
  );

  if (!match) {
    return {
      name: line.trim(),
      quantityText: "",
    };
  }

  return {
    name: match[1].trim(),
    quantityText: match[2].trim(),
  };
}

function parseQuantity(quantityText) {
  if (!quantityText) {
    return {
      amount: null,
      amountMin: null,
      amountMax: null,
      unit: null,
    };
  }

  const rangeMatch = quantityText.match(
    /^(\d+(?:[.,]\d+)?|\d+\/\d+)\s*[–—-]\s*(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(.*)$/
  );

  if (rangeMatch) {
    return {
      amount: null,
      amountMin: parseNumericToken(rangeMatch[1]),
      amountMax: parseNumericToken(rangeMatch[2]),
      unit: rangeMatch[3].trim() || null,
    };
  }

  const singleMatch = quantityText.match(
    /^(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(.*)$/
  );

  if (singleMatch) {
    return {
      amount: parseNumericToken(singleMatch[1]),
      amountMin: null,
      amountMax: null,
      unit: singleMatch[2].trim() || null,
    };
  }

  return {
    amount: null,
    amountMin: null,
    amountMax: null,
    unit: quantityText,
  };
}

function parseIngredients(text) {
  const ingredients = [];
  let section = null;

  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const sectionMatch = line.match(
      /^\[(.*)\]$/
    );

    if (sectionMatch) {
      section =
        sectionMatch[1].trim() || null;

      continue;
    }

    const {
      name,
      quantityText,
    } = splitNameAndQuantity(line);

    if (!name) {
      continue;
    }

    const quantity =
      parseQuantity(quantityText);

    ingredients.push({
      position: ingredients.length + 1,
      section,
      name,
      amount: quantity.amount,
      amountMin: quantity.amountMin,
      amountMax: quantity.amountMax,
      unit: quantity.unit,
      rawText: line,
    });
  }

  return ingredients;
}

function parseSteps(text) {
  const steps = [];
  let section = null;

  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const originalLine of lines) {
    const sectionMatch = originalLine.match(
      /^\[(.*)\]$/
    );

    if (sectionMatch) {
      section =
        sectionMatch[1].trim() || null;

      continue;
    }

    const instruction = originalLine
      .replace(/^\d+[\.\)]\s*/, "")
      .trim();

    if (!instruction) {
      continue;
    }

    steps.push({
      position: steps.length + 1,
      section,
      instruction,
    });
  }

  return steps;
}

function normalizeComparison(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ");
}

function getField(name) {
  return recipeForm.elements.namedItem(name);
}

function getFieldValue(name) {
  const field = getField(name);

  return field
    ? String(field.value || "").trim()
    : "";
}

function setFieldValue(name, value) {
  const field = getField(name);

  if (!field) {
    return;
  }

  field.value =
    value === null || value === undefined
      ? ""
      : String(value);
}

function getCheckboxValue(name) {
  const field = getField(name);
  return Boolean(field?.checked);
}

function setCheckboxValue(name, value) {
  const field = getField(name);

  if (field) {
    field.checked = Boolean(value);
  }
}

function getSelectedImageFile() {
  return imageInput.files?.[0] || null;
}

function buildPayload() {
  const servings =
    parseNumber(getFieldValue("servings"));

  const prepMinutes =
    parseNumber(getFieldValue("prepMinutes"));

  const cookMinutes =
    parseNumber(getFieldValue("cookMinutes"));

  const totalMinutes =
    parseNumber(getFieldValue("totalMinutes"));

  const selectedCategories =
    (categoryPicker?.getSelected() || []).slice(0, 20);

  const categories = selectedCategories.length
    ? selectedCategories
    : ["Без категории"];

  return {
    title: getFieldValue("title"),

    description:
      getFieldValue("description") || null,

    categories,

    tags:
      (tagPicker?.getSelected() || []).slice(0, 30),

    servings,

    servingsText:
      getFieldValue("servingsText") ||
      (
        servings !== null
          ? `${servings} порций`
          : null
      ),

    prepMinutes,
    cookMinutes,
    totalMinutes,

    imageKey: null,

    imageSourceUrl:
      importedImageSourceUrl || null,

    imageCredit:
      getFieldValue("imageCredit") || null,

    sourceName:
      getFieldValue("sourceName") ||
      "Рецепт от Пети",

    sourceUrl:
      getFieldValue("sourceUrl") || null,

    ingredients:
      parseIngredients(
        getFieldValue("ingredients")
      ),

    steps:
      parseSteps(
        getFieldValue("steps")
      ),

    tips:
      getFieldValue("tips") || null,

    serveWith:
      getFieldValue("serveWith") || null,

    highlight:
      getFieldValue("highlight") || null,

    batchTip:
      getFieldValue("batchTip") || null,

    notes:
      getFieldValue("notes") || null,

    isVerified:
      getCheckboxValue("isVerified"),

    isFavorite:
      getCheckboxValue("isFavorite"),

    isWeeklyPrep:
      getCheckboxValue("isWeeklyPrep"),
  };
}

function validatePayload(payload, imageFile) {
  const errors = [];

  if (!payload.title) {
    errors.push("Укажите название рецепта.");
  }

  if (!payload.ingredients.length) {
    errors.push(
      "Добавьте хотя бы один ингредиент."
    );
  }

  if (!payload.steps.length) {
    errors.push(
      "Добавьте хотя бы один шаг приготовления."
    );
  }

  const imageError =
    validateImageFile(imageFile);

  if (imageError) {
    errors.push(imageError);
  }

  return errors;
}

async function findExistingRecipe(
  key,
  title,
  sourceUrl
) {
  const queries = [title];

  if (sourceUrl) {
    queries.push(sourceUrl);
  }

  for (const query of queries) {
    const response = await fetch(
      `/api/admin/recipes/search?query=${
        encodeURIComponent(query)
      }`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${key}`,
        },
      }
    );

    if (response.status === 401) {
      removeKey();
      showLogin();

      throw new Error(
        "Срок режима редактора закончился. Введите ключ ещё раз."
      );
    }

    const data = await response
      .json()
      .catch(() => null);

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.message ||
        data?.error ||
        "Не удалось проверить дубликаты."
      );
    }

    const exactMatch = (data.items || []).find(
      (item) => {
        const sameTitle =
          normalizeComparison(item.title) ===
          normalizeComparison(title);

        const sameSource =
          sourceUrl &&
          item.source_url === sourceUrl;

        return sameTitle || sameSource;
      }
    );

    if (exactMatch) {
      return exactMatch;
    }
  }

  return null;
}

async function uploadImage(file, title, key) {
  if (!file) {
    return null;
  }

  const formData = new FormData();

  formData.append("image", file);
  formData.append("title", title);

  const response = await fetch(
    "/api/admin/images",
    {
      method: "POST",

      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
      },

      body: formData,
    }
  );

  const data = await response
    .json()
    .catch(() => null);

  if (response.status === 401) {
    removeKey();
    showLogin();

    throw new Error(
      "Срок режима редактора закончился. Введите ключ ещё раз."
    );
  }

  if (
    !response.ok ||
    !data?.success ||
    !data?.item?.imageKey
  ) {
    throw new Error(
      data?.message ||
      data?.error ||
      "Не удалось загрузить фотографию."
    );
  }

  return data.item;
}

async function importImageToR2(
  imageUrl,
  title,
  sourceUrl,
  key
) {
  const response = await fetch(
    `${IMPORTER_ORIGIN}/api/import/image`,
    {
      method: "POST",

      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },

      body: JSON.stringify({
        url: imageUrl,
        title,
        sourceUrl,
      }),
    }
  );

  const data = await response
    .json()
    .catch(() => null);

  if (response.status === 401) {
    removeKey();
    showLogin();

    throw new Error(
      "Ключ импортёра не подошёл. Проверьте ADMIN_API_KEY у recepty-importer."
    );
  }

  if (
    !response.ok ||
    !data?.success ||
    !data?.item?.imageKey
  ) {
    throw new Error(
      data?.message ||
      data?.error ||
      "Не удалось сохранить найденную фотографию. Уберите её и попробуйте сохранить рецепт без изображения."
    );
  }

  return data.item;
}

function showDuplicate(existing) {
  saveStatus.replaceChildren();
  saveStatus.className =
    "status-message error";

  const text = document.createElement("span");

  text.textContent =
    `Рецепт «${existing.title}» уже существует. `;

  const link = document.createElement("a");

  link.href = existing.url;
  link.textContent =
    "Открыть существующий рецепт";

  saveStatus.append(text, link);
  saveStatus.hidden = false;

  saveStatus.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}

function showSavedRecipe(item) {
  saveStatus.replaceChildren();
  saveStatus.className =
    "status-message success";

  const text = document.createElement("span");

  text.textContent =
    `Рецепт «${item.title}» добавлен. `;

  const link = document.createElement("a");

  link.href = item.url;
  link.textContent = "Открыть рецепт";

  saveStatus.append(text, link);
  saveStatus.hidden = false;

  saveStatus.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}

function clearImportPreview() {
  currentImport = null;
  importPreview.hidden = true;
  importPreviewImageWrap.hidden = true;
  importPreviewImage.removeAttribute("src");
  importPreviewTitle.textContent = "Рецепт";
  importPreviewDescription.textContent = "";
  importPreviewDescription.hidden = true;
  importPreviewSource.textContent = "";
  importPreviewMeta.replaceChildren();
  importPreviewWarnings.replaceChildren();
  importPreviewWarnings.hidden = true;
  importPreviewIngredients.replaceChildren();
  importPreviewSteps.replaceChildren();
  importImageChoice.hidden = true;
  importImageCheckbox.checked = true;
}

function createMetaChip(text) {
  const chip = document.createElement("span");
  chip.textContent = text;
  return chip;
}

function ingredientTextForCoalesce(ingredient) {
  if (typeof ingredient === "string") {
    return ingredient.trim();
  }

  if (!ingredient || typeof ingredient !== "object") {
    return "";
  }

  const rawText =
    ingredient.rawText ||
    ingredient.raw_text ||
    "";

  if (rawText.trim()) {
    return rawText.trim();
  }

  return (ingredient.name || "").trim();
}

function coalesceIngredientLines(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const SEPARATOR_RE = /^[—–-]$/;

  const lines = [];
  let buffer = null;
  let pendingSeparator = false;

  function commitBuffer() {
    if (buffer === null) {
      return;
    }

    const text = buffer.trim();

    buffer = null;
    pendingSeparator = false;

    if (text) {
      lines.push(text);
    }
  }

  function pushSection(section) {
    commitBuffer();
    lines.push({ section: section || null });
  }

  function looksLikeQuantity(text) {
    return (
      /^\d+(?:[.,]\d+)?\s*[^\s]/.test(text) ||
      /^\d+(?:[.,]\d+)?\s*$/.test(text)
    );
  }

  for (const item of items) {
    const text = ingredientTextForCoalesce(item);

    if (!text) {
      if (item && typeof item === "object" && item.section) {
        pushSection(item.section);
      }
      continue;
    }

    if (SEPARATOR_RE.test(text)) {
      if (buffer !== null) {
        pendingSeparator = true;
      }
      continue;
    }

    if (
      buffer !== null &&
      pendingSeparator &&
      looksLikeQuantity(text)
    ) {
      buffer = `${buffer} — ${text}`;
      pendingSeparator = false;
      commitBuffer();
      continue;
    }

    pendingSeparator = false;
    commitBuffer();
    buffer = text;
  }

  commitBuffer();

  const merged = [];
  let currentSection = null;

  for (const entry of lines) {
    if (typeof entry === "object" && entry !== null) {
      currentSection = entry.section || null;
      continue;
    }

    const rawText = String(entry).replace(/\s+/g, " ").trim();

    merged.push({
      position: merged.length + 1,
      section: currentSection,
      name: rawText.split(/\s+[—–-]\s+/)[0]?.trim() || rawText,
      amount: null,
      amountMin: null,
      amountMax: null,
      unit: null,
      rawText,
    });
  }

  return merged;
}

function ingredientDisplayText(ingredient) {
  if (typeof ingredient === "string") {
    return ingredient;
  }

  const rawText =
    ingredient?.rawText ||
    ingredient?.raw_text ||
    "";

  if (rawText.trim()) {
    return rawText.trim();
  }

  const name = ingredient?.name || "Ингредиент";

  const amount = ingredient?.amount ?? null;
  const amountMin = ingredient?.amountMin ?? null;
  const amountMax = ingredient?.amountMax ?? null;
  const unit = ingredient?.unit || null;

  let quantity = "";

  if (amountMin !== null && amountMax !== null) {
    quantity = `${amountMin}–${amountMax}`;
  } else if (amount !== null) {
    quantity = String(amount);
  }

  const quantityWithUnit =
    [quantity, unit].filter(Boolean).join(" ");

  return quantityWithUnit
    ? `${name} — ${quantityWithUnit}`
    : name;
}

function renderImportPreview(item, extraWarnings = []) {
  const rawIngredients =
    Array.isArray(item?.ingredients) ? item.ingredients : [];

  const ingredients =
    coalesceIngredientLines(rawIngredients);

  const suggested = TAXONOMY.suggestCategoryAndTags({
    title: item?.title || "",
    ingredients,
    steps: Array.isArray(item?.steps) ? item.steps : [],
  });

  currentImport = {
    title: item?.title || "",
    description: item?.description || null,
    categories: suggested.categories,
    tags: [],
    servings: item?.servings ?? null,
    servingsText: item?.servingsText ?? null,
    prepMinutes: item?.prepMinutes ?? null,
    cookMinutes: item?.cookMinutes ?? null,
    totalMinutes: item?.totalMinutes ?? null,
    imageSourceUrl: item?.imageSourceUrl || null,
    sourceName: item?.sourceName || null,
    sourceUrl: item?.sourceUrl || importUrlInput.value.trim(),
    ingredients,
    steps: Array.isArray(item?.steps) ? item.steps : [],
    tips: item?.tips || null,
    serveWith: item?.serveWith || null,
    highlight: item?.highlight || null,
    batchTip: item?.batchTip || null,
    notes: item?.notes || null,
    isVerified: Boolean(item?.isVerified),
    isFavorite: Boolean(item?.isFavorite),
    isWeeklyPrep: false,
    suggested,
    warnings: [
      ...(Array.isArray(item?.warnings) ? item.warnings : []),
      ...extraWarnings,
    ].filter(Boolean),
  };

  importPreviewTitle.textContent =
    currentImport.title || "Название не найдено";

  if (currentImport.description) {
    importPreviewDescription.textContent =
      currentImport.description;
    importPreviewDescription.hidden = false;
  } else {
    importPreviewDescription.textContent = "";
    importPreviewDescription.hidden = true;
  }

  importPreviewSource.textContent =
    currentImport.sourceUrl || "";

  importPreviewMeta.replaceChildren();

  const metaValues = [];

  for (const categoryName of currentImport.categories) {
    metaValues.push(categoryName);
  }

  for (const tagName of currentImport.tags) {
    metaValues.push(`#${tagName}`);
  }

  if (currentImport.servingsText) {
    metaValues.push(currentImport.servingsText);
  } else if (currentImport.servings !== null) {
    metaValues.push(`${currentImport.servings} порций`);
  }

  if (currentImport.totalMinutes !== null) {
    metaValues.push(`${currentImport.totalMinutes} мин`);
  }

  for (const metaValue of metaValues) {
    importPreviewMeta.append(
      createMetaChip(metaValue)
    );
  }

  if (currentImport.imageSourceUrl) {
    importPreviewImage.src =
      currentImport.imageSourceUrl;
    importPreviewImageWrap.hidden = false;
    importImageChoice.hidden = false;
    importImageCheckbox.checked = true;
  } else {
    importPreviewImage.removeAttribute("src");
    importPreviewImageWrap.hidden = true;
    importImageChoice.hidden = true;
    importImageCheckbox.checked = false;
  }

  importPreviewWarnings.replaceChildren();

  if (currentImport.warnings.length) {
    for (const warning of currentImport.warnings) {
      const itemElement = document.createElement("li");
      itemElement.textContent = warning;
      importPreviewWarnings.append(itemElement);
    }

    importPreviewWarnings.hidden = false;
  } else {
    importPreviewWarnings.hidden = true;
  }

  importPreviewIngredients.replaceChildren();

  for (const ingredient of currentImport.ingredients) {
    const itemElement = document.createElement("li");
    itemElement.textContent = ingredientDisplayText(ingredient);
    importPreviewIngredients.append(itemElement);
  }

  if (!currentImport.ingredients.length) {
    const itemElement = document.createElement("li");
    itemElement.textContent = "Ингредиенты не найдены.";
    importPreviewIngredients.append(itemElement);
  }

  importIngredientsHeading.textContent =
    `Ингредиенты (${currentImport.ingredients.length})`;

  importPreviewSteps.replaceChildren();

  for (const step of currentImport.steps) {
    const itemElement = document.createElement("li");
    itemElement.textContent =
      typeof step === "string"
        ? step
        : step?.instruction || step?.text || "Шаг";
    importPreviewSteps.append(itemElement);
  }

  if (!currentImport.steps.length) {
    const itemElement = document.createElement("li");
    itemElement.textContent = "Шаги приготовления не найдены.";
    importPreviewSteps.append(itemElement);
  }

  importStepsHeading.textContent =
    `Приготовление (${currentImport.steps.length})`;

  importPreview.hidden = false;
  importPreview.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function formatStructuredLines(items, type) {
  if (!Array.isArray(items)) {
    return "";
  }

  const lines = [];
  let currentSection = undefined;
  let visibleStepNumber = 0;

  for (const item of items) {
    const section =
      typeof item === "object" && item !== null
        ? item.section || null
        : null;

    if (section !== currentSection) {
      if (currentSection !== undefined) {
        lines.push("");
      }

      if (section) {
        lines.push(`[${section}]`);
      } else if (currentSection) {
        lines.push("[]");
      }

      currentSection = section;
    }

    if (type === "ingredients") {
      lines.push(ingredientDisplayText(item));
      continue;
    }

    const instruction =
      typeof item === "string"
        ? item
        : item?.instruction || item?.text || "";

    if (!instruction) {
      continue;
    }

    if (section) {
      lines.push(instruction);
    } else {
      visibleStepNumber += 1;
      lines.push(`${visibleStepNumber}. ${instruction}`);
    }
  }

  return lines.join("\n").trim();
}

function formHasRecipeContent() {
  return Boolean(
    getFieldValue("title") ||
    getFieldValue("ingredients") ||
    getFieldValue("steps")
  );
}

function applyImportedRecipe() {
  if (!currentImport) {
    return;
  }

  if (formHasRecipeContent()) {
    const confirmed = window.confirm(
      "В форме уже есть данные. Заменить их найденным рецептом?"
    );

    if (!confirmed) {
      return;
    }
  }

  recipeForm.reset();
  categoryPicker?.clear();
  tagPicker?.clear();
  clearImagePreview();
  hideStatus(saveStatus);

  setFieldValue("title", currentImport.title);
  setFieldValue("description", currentImport.description);

  const suggested =
    currentImport.suggested ||
    TAXONOMY.suggestCategoryAndTags(currentImport);

  const suggestedCategories =
    (Array.isArray(currentImport.categories) &&
      currentImport.categories.length
      ? currentImport.categories
      : suggested.categories) || [];

  categoryPicker?.setSelected(suggestedCategories);
  tagPicker?.clear();

  setFieldValue("servings", currentImport.servings);
  setFieldValue("servingsText", currentImport.servingsText);
  setFieldValue("prepMinutes", currentImport.prepMinutes);
  setFieldValue("cookMinutes", currentImport.cookMinutes);
  setFieldValue("totalMinutes", currentImport.totalMinutes);
  setFieldValue("sourceName", currentImport.sourceName || "Рецепт от Пети");
  setFieldValue("sourceUrl", currentImport.sourceUrl);
  setFieldValue(
    "imageCredit",
    currentImport.imageSourceUrl
      ? "Фотография со страницы-источника"
      : ""
  );
  setFieldValue(
    "ingredients",
    formatStructuredLines(
      currentImport.ingredients,
      "ingredients"
    )
  );
  setFieldValue(
    "steps",
    formatStructuredLines(
      currentImport.steps,
      "steps"
    )
  );
  setFieldValue("tips", currentImport.tips);
  setFieldValue("serveWith", currentImport.serveWith);
  setFieldValue("highlight", currentImport.highlight);
  setFieldValue("batchTip", currentImport.batchTip);
  setFieldValue("notes", currentImport.notes);

  setCheckboxValue("isVerified", currentImport.isVerified);
  setCheckboxValue("isFavorite", currentImport.isFavorite);
  setCheckboxValue("isWeeklyPrep", false);

  if (
    currentImport.imageSourceUrl &&
    importImageCheckbox.checked
  ) {
    showImportedImagePreview(
      currentImport.imageSourceUrl
    );
  }

  setStatus(
    saveStatus,
    "Данные перенесены в форму. Проверьте название, ингредиенты, шаги и метки. Рецепт ещё не сохранён.",
    "success"
  );

  recipeForm.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

async function requestImportPreview(url, key) {
  const response = await fetch(
    `${IMPORTER_ORIGIN}/api/import/preview`,
    {
      method: "POST",

      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },

      body: JSON.stringify({ url }),
    }
  );

  const data = await response
    .json()
    .catch(() => null);

  if (response.status === 401) {
    throw new Error(
      "Ключ импортёра не подошёл. Проверьте ADMIN_API_KEY у recepty-importer."
    );
  }

  if (response.status === 422 && data?.partial) {
    renderImportPreview(
      {
        ...data.partial,
        ingredients: [],
        steps: [],
        category: "Без категории",
        tags: [],
        sourceName: null,
      },
      [
        data.message ||
        "Автоматически найдено только часть данных. Ингредиенты и шаги нужно заполнить вручную.",
      ]
    );

    return;
  }

  if (!response.ok || !data?.success || !data?.item) {
    throw new Error(
      data?.message ||
      data?.error ||
      "Не удалось получить рецепт по ссылке."
    );
  }

  renderImportPreview(data.item);
}

imageInput.addEventListener(
  "change",
  () => {
    const file =
      imageInput.files?.[0] || null;

    if (!file) {
      clearImagePreview();
      return;
    }

    showImagePreview(file);
  }
);

removeImageButton.addEventListener(
  "click",
  clearImagePreview
);

importForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();
    hideStatus(importStatus);
    clearImportPreview();

    const key = getStoredKey();
    const url = importUrlInput.value.trim();

    if (!key) {
      showLogin();
      return;
    }

    if (!url) {
      setStatus(
        importStatus,
        "Вставьте ссылку на рецепт.",
        "error"
      );
      return;
    }

    importButton.disabled = true;
    importButton.textContent = "Получаем…";

    setStatus(
      importStatus,
      "Открываем страницу и ищем рецепт…"
    );

    try {
      await requestImportPreview(url, key);
      setStatus(
        importStatus,
        "Рецепт найден. Проверьте предварительную карточку ниже.",
        "success"
      );
    } catch (error) {
      setStatus(
        importStatus,
        error instanceof Error
          ? error.message
          : "Импорт завершился с ошибкой.",
        "error"
      );
    } finally {
      importButton.disabled = false;
      importButton.textContent = "Получить рецепт";
    }
  }
);

applyImportButton.addEventListener(
  "click",
  applyImportedRecipe
);

cancelImportButton.addEventListener(
  "click",
  () => {
    clearImportPreview();
    hideStatus(importStatus);
    importUrlInput.value = "";
    importUrlInput.focus();
  }
);

loginForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();
    hideStatus(loginStatus);

    const key = keyInput.value.trim();

    if (!key) {
      setStatus(
        loginStatus,
        "Введите ключ редактора.",
        "error"
      );

      return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "Проверяем…";

    try {
      const valid = await verifyKey(key);

      if (!valid) {
        setStatus(
          loginStatus,
          "Ключ не подошёл. Проверьте его и попробуйте снова.",
          "error"
        );

        return;
      }

      storeKey(key);
      showEditor();
    } catch (error) {
      setStatus(
        loginStatus,
        error instanceof Error
          ? error.message
          : "Не удалось проверить ключ.",
        "error"
      );
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = "Войти";
    }
  }
);

logoutButton.addEventListener(
  "click",
  () => {
    removeKey();
    recipeForm.reset();
    categoryPicker?.clear();
    tagPicker?.clear();
    importForm.reset();
    clearImagePreview();
    clearImportPreview();
    hideStatus(saveStatus);
    hideStatus(importStatus);
    showLogin();
  }
);

resetButton.addEventListener(
  "click",
  () => {
    const confirmed = window.confirm(
      "Очистить все поля формы?"
    );

    if (!confirmed) {
      return;
    }

    recipeForm.reset();
    categoryPicker?.clear();
    tagPicker?.clear();
    clearImagePreview();
    hideStatus(saveStatus);

    setFieldValue("sourceName", "Рецепт от Пети");

    document
      .querySelector("#title")
      .focus();
  }
);

recipeForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();
    hideStatus(saveStatus);

    const key = getStoredKey();

    if (!key) {
      showLogin();
      return;
    }

    const imageFile =
      getSelectedImageFile();

    const payload = buildPayload();

    const errors =
      validatePayload(payload, imageFile);

    if (errors.length) {
      setStatus(
        saveStatus,
        errors.join(" "),
        "error"
      );

      return;
    }

    saveButton.disabled = true;
    saveButton.textContent =
      "Проверяем дубликаты…";

    try {
      const existing =
        await findExistingRecipe(
          key,
          payload.title,
          payload.sourceUrl
        );

      if (existing) {
        showDuplicate(existing);
        return;
      }

      if (imageFile) {
        saveButton.textContent =
          "Загружаем фотографию…";

        setStatus(
          saveStatus,
          "Фотография загружается в хранилище…"
        );

        const uploadedImage =
          await uploadImage(
            imageFile,
            payload.title,
            key
          );

        payload.imageKey =
          uploadedImage.imageKey;

        payload.imageSourceUrl = null;
      } else if (importedImageSourceUrl) {
        saveButton.textContent =
          "Сохраняем фотографию…";

        setStatus(
          saveStatus,
          "Копируем найденную фотографию в ваше R2-хранилище…"
        );

        const importedImage =
          await importImageToR2(
            importedImageSourceUrl,
            payload.title,
            payload.sourceUrl,
            key
          );

        payload.imageKey =
          importedImage.imageKey;
      }

      saveButton.textContent =
        "Сохраняем рецепт…";

      setStatus(
        saveStatus,
        "Сохраняем карточку рецепта…"
      );

      const response = await fetch(
        "/api/admin/recipes",
        {
          method: "POST",

          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },

          body: JSON.stringify(payload),
        }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (response.status === 401) {
        removeKey();
        showLogin();

        throw new Error(
          "Срок режима редактора закончился. Введите ключ ещё раз."
        );
      }

      if (response.status === 409) {
        if (data?.existing) {
          showDuplicate(data.existing);
          return;
        }

        throw new Error(
          data?.message ||
          "Такой рецепт уже существует."
        );
      }

      if (
        !response.ok ||
        !data?.success ||
        !data?.item
      ) {
        throw new Error(
          data?.message ||
          data?.error ||
          "Не удалось сохранить рецепт."
        );
      }

      showSavedRecipe(data.item);
    } catch (error) {
      setStatus(
        saveStatus,
        error instanceof Error
          ? error.message
          : "Не удалось сохранить рецепт.",
        "error"
      );
    } finally {
      saveButton.disabled = false;
      saveButton.textContent =
        "Сохранить рецепт";
    }
  }
);

async function initializeEditor() {
  const storedKey = getStoredKey();

  if (!storedKey) {
    showLogin();
    return;
  }

  try {
    const valid =
      await verifyKey(storedKey);

    if (!valid) {
      removeKey();
      showLogin();
      return;
    }

    showEditor();
  } catch {
    removeKey();
    showLogin();
  }
}

initializeEditor();
