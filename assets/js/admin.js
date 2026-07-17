const ADMIN_KEY_STORAGE = "receptyAdminKey";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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

const recipeForm =
  document.querySelector("#recipe-form");

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

function clearImagePreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  imageInput.value = "";
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

function parseTags(value) {
  return String(value)
    .split(/,|\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeComparison(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ");
}

function getFieldValue(name) {
  const field =
    recipeForm.elements.namedItem(name);

  return field
    ? String(field.value || "").trim()
    : "";
}

function getCheckboxValue(name) {
  const field =
    recipeForm.elements.namedItem(name);

  return Boolean(field?.checked);
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

  const category =
    getFieldValue("category") ||
    "Без категории";

  return {
    title: getFieldValue("title"),

    description:
      getFieldValue("description") || null,

    category,

    tags:
      parseTags(getFieldValue("tags")),

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
    clearImagePreview();
    hideStatus(saveStatus);
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
    clearImagePreview();
    hideStatus(saveStatus);

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
