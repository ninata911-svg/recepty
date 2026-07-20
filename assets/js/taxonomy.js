const CATEGORIES = [
  "Попробовать",
  "Завтрак",
  "Вторые блюда",
  "Салаты",
  "Гарнир",
  "Закуски",
  "Выпечка",
  "Десерты",
  "Суп",
  "ПП",
  "Соусы и маринады",
  "Напитки",
  "Заготовки",
];

const TAGS = [
  "Казан",
  "GPT",
  "Домашнее",
  "Супербыстро",
  "Мясо",
  "К супу",
  "Фарш",
  "Курица",
  "Рыба",
  "Субпродукты",
  "Макароны",
  "Консервы",
  "Морепродукты",
  "Ягоды фрукты орехи",
  "На пикник",
  "Комбайн",
  "Соления",
  "К шашлыку",
  "Мультиварка",
  "Мамин рецепт",
  "Молочка",
  "Заготовки на неделю",
  "Из остатков",
  "Гриль",
  "Фритюрница",
  "Индейка",
];

const CATEGORY_RULES = [
  {
    category: "Завтрак",
    keywords: [
      "завтрак",
      "омлет",
      "яичниц",
      "сырник",
      "блин",
      "блинчик",
      "овсян",
      "каша",
      "гречк",
      "пшён",
      "пшен",
      "кукурузн",
      "гранол",
      "мюсл",
      "творог",
      "творожн",
      "вафл",
      "тост",
      "утренн",
    ],
  },
  {
    category: "Вторые блюда",
    keywords: [
      "второе",
      "котлет",
      "тефтел",
      "фрикадел",
      "гуляш",
      "рагу",
      "жарк",
      "жаркое",
      "бефстрог",
      "стейк",
      "отбивн",
      "шницель",
      "эскалоп",
      "рулет мясн",
      "мясн",
      "птиц",
    ],
  },
  {
    category: "Салаты",
    keywords: ["салат", "винегрет", "мимоз"],
  },
  {
    category: "Гарнир",
    keywords: [
      "гарнир",
      "пюре",
      "картошк",
      "картофель",
      "рис ",
      "рисом",
      "рисовый",
      "макарон",
      "вермишел",
      "гречк",
      "бобов",
      "чечевиц",
      "фасоль",
    ],
  },
  {
    category: "Закуски",
    keywords: [
      "закуск",
      "канапе",
      "тарталетк",
      "бутерброд",
      "сэндвич",
      "рулет",
      "намазк",
      "паштет",
      "тартар",
      "карпачч",
      "брускет",
    ],
  },
  {
    category: "Выпечка",
    keywords: [
      "пирог",
      "пирожк",
      "пицц",
      "киш",
      "кекс",
      "бисквит",
      "печень",
      "ватрушк",
      "булочк",
      "хлеб",
      "тесто",
      "слоён",
      "слоен",
      "песочн",
      "дрожжев",
      "беляш",
      "чебурек",
      "осетинск",
      "хачапур",
    ],
  },
  {
    category: "Десерты",
    keywords: [
      "десерт",
      "торт",
      "пирожн",
      "морожен",
      "мусс",
      "желе",
      "пудинг",
      "крем",
      "шоколад",
      "карамел",
      "сгущён",
      "сгущен",
      "сладост",
    ],
  },
  {
    category: "Суп",
    keywords: [
      "суп",
      "борщ",
      "рассольник",
      "солянк",
      "окрошк",
      "уха",
      "лапша",
      "бульон",
      "похлёбк",
      "похлебк",
      "минестр",
      "томатн суп",
      "тыквенн суп",
      "куриный суп",
      "грибной суп",
    ],
  },
  {
    category: "ПП",
    keywords: [
      "пп ",
      "правильн питан",
      "диетич",
      "нежирн",
      "обезжирен",
      "fitness",
      "fit ",
      "диета",
      "низкокалор",
      "без сахара",
      "стевия",
      "кето",
      "low carb",
    ],
  },
  {
    category: "Соусы и маринады",
    keywords: [
      "соус",
      "маринад",
      "заправк",
      "подлив",
      "аджик",
      "кетчуп",
      "майонез",
      "горчиц",
      "уксус",
      "рассол",
    ],
  },
  {
    category: "Напитки",
    keywords: [
      "напиток",
      "смузи",
      "коктейль",
      "компот",
      "кисель",
      "морс",
      "лимонад",
      "чай",
      "какао",
      "глинтвейн",
      "гоголь",
    ],
  },
  {
    category: "Заготовки",
    keywords: [
      "заготовк",
      "консерв",
      "маринован",
      "солён",
      "солен",
      "квашен",
      "вялён",
      "вялен",
      "сушён",
      "сушен",
      "аджик",
      "икра кабач",
      "лечо",
      "варенье",
      "джем ",
      "повидл",
      "на зиму",
    ],
  },
];

const TAG_RULES = [
  {
    tag: "Казан",
    keywords: ["казан", "в казане", "по-узбекски", "плов в казане"],
  },
  { tag: "GPT", keywords: [] },
  {
    tag: "Домашнее",
    keywords: [
      "домашн",
      "как в детств",
      "бабушкин",
      "мамин",
      "семейн",
      "дачн",
    ],
  },
  {
    tag: "Супербыстро",
    keywords: [
      "быстро",
      "за 15 мин",
      "за 20 мин",
      "за 10 мин",
      "пятнадцать минут",
      "экспресс",
      "ленив",
    ],
  },
  {
    tag: "Мясо",
    keywords: [
      "свинин",
      "говядин",
      "телятин",
      "баранин",
      "мясо",
      "мясн",
      "стейк",
      "вырезк",
      "корейк",
      "грудинк",
    ],
  },
  {
    tag: "К супу",
    keywords: [
      "к супу",
      "для супа",
      "на бульон",
      "сухарик",
      "гренк",
      "к гренкам",
    ],
  },
  {
    tag: "Фарш",
    keywords: [
      "фарш",
      "мясной фарш",
      "котлет",
      "тефтел",
      "фрикадел",
      "люля",
      "чебурек",
      "беляш",
    ],
  },
  {
    tag: "Курица",
    keywords: [
      "кури",
      "курин",
      "цыплён",
      "цыплен",
      "петух",
      "окороч",
      "голен",
      "бедр",
      "филе",
      "грудк",
      "крылыш",
    ],
  },
  {
    tag: "Рыба",
    keywords: [
      "рыб",
      "лосос",
      "форел",
      "сёмг",
      "семг",
      "сельд",
      "скумри",
      "треск",
      "минтай",
      "карп",
      "щук",
      "окун",
      "горбуш",
      "кета",
      "тунец",
    ],
  },
  {
    tag: "Субпродукты",
    keywords: [
      "печен",
      "печён",
      "почки",
      "сердц",
      "язык говяж",
      "вымя",
      "рубец",
      "лёгкое",
      "легкое",
      "потроха",
      "сальтисон",
      "холодец",
    ],
  },
  {
    tag: "Макароны",
    keywords: [
      "макарон",
      "спагетт",
      "вермишел",
      "паста ",
      "пенне",
      "феттуч",
      "лазань",
      "равиол",
      "тартел",
      "лапша",
    ],
  },
  {
    tag: "Консервы",
    keywords: [
      "консерв",
      "банк",
      "тунец в собствен",
      "горошек консерв",
      "кукуруза консерв",
      "оливк",
      "маслин",
      "вяленые томаты",
    ],
  },
  {
    tag: "Морепродукты",
    keywords: [
      "кревет",
      "миди",
      "кальмар",
      "осьминог",
      "устриц",
      "гребеш",
      "краб",
      "омар",
      "лангуст",
      "морепродукт",
      "коктейль морск",
    ],
  },
  {
    tag: "Ягоды фрукты орехи",
    keywords: [
      "ягод",
      "клубник",
      "малин",
      "черник",
      "смородин",
      "ежевик",
      "крыжов",
      "яблок",
      "груш",
      "слива",
      "сливы",
      "сливу",
      "сливой",
      "сливовый",
      "сливовое",
      "абрикос",
      "персик",
      "манго",
      "ананас",
      "банан",
      "апельсин",
      "мандарин",
      "лимон",
      "грецк",
      "миндал",
      "фундук",
      "кедров",
      "кешью",
      "арахис",
    ],
  },
  {
    tag: "На пикник",
    keywords: ["пикник", "на природ", "на дач", "гриль на природ"],
  },
  {
    tag: "Комбайн",
    keywords: ["кухонный комбайн", "в комбайне", "измельчить в комбайне"],
  },
  {
    tag: "Соления",
    keywords: [
      "солён",
      "солен",
      "квашен",
      "маринован",
      "огурцы на зиму",
      "помидоры на зиму",
      "рассол",
    ],
  },
  {
    tag: "К шашлыку",
    keywords: [
      "к шашлык",
      "шашлык",
      "маринад для шашл",
      "соус к мясу",
      "кебаб",
      "люля",
    ],
  },
  {
    tag: "Мультиварка",
    keywords: ["мультиварк", "в чаше", "режим «тушение»", "режим тушения"],
  },
  {
    tag: "Мамин рецепт",
    keywords: ["мамин", "как у мамы", "мама делала", "детстве"],
  },
  {
    tag: "Молочка",
    keywords: [
      "молок",
      "сливк",
      "сметан",
      "творог",
      "творожн",
      "йогурт",
      "кефир",
      "ряженк",
      "сыр ",
      "сырник",
      "масл",
      "сливочн",
    ],
  },
  {
    tag: "Из остатков",
    keywords: [
      "остатки",
      "из остатков",
      "вчерашн",
      "противень очист",
      "прошлый ужин",
    ],
  },
  {
    tag: "Гриль",
    keywords: ["гриль", "на углях", "барбекю", "барбекюшница", "мангал"],
  },
  {
    tag: "Фритюрница",
    keywords: ["фритюр", "во фритюре", "фритюрниц", "глубоком жире"],
  },
  {
    tag: "Индейка",
    keywords: ["индейк", "филе индей", "фарш индей", "грудка индей"],
  },
];

const WEEKLY_PREP_STRICT_WHITELIST = [
  "пельмен",
  "вареник",
  "котлет",
  "тефтел",
  "фрикадел",
  "голубц",
  "фаршированн перц",
  "фаршированные перц",
  "блинчик с начинк",
  "блин с начинк",
  "домашн колбас",
  "домашние колбас",
  "колбаски домашн",
];

const WEEKLY_PREP_CONDITIONAL_WHITELIST = [
  "сырник",
  "куриц",
  "свинин",
  "шашлык",
  "гуляш основа",
  "основа для гуляш",
  "овощн смесь",
  "овощная смесь",
];

const WEEKLY_PREP_BLACKLIST = [
  "суп",
  "борщ",
  "рассольник",
  "солянк",
  "окрошк",
  "уха",
  "макарон по-флотск",
  "макароны по-флотск",
  "омлет",
  "пюре",
  "картофельн пюре",
  "картофельное пюре",
  "гречк",
  "салат",
  "винегрет",
  "мимоз",
  "готовое блюд",
  "на стол",
];

const WEEKLY_PREP_EXPLICIT_HINTS = [
  "заморозк",
  "заморозить",
  "заморожен",
  "вакуум",
  "завакуумир",
  "маринован",
  "маринад",
  "в маринад",
  "на неделю",
  "большая парти",
  "большой парти",
  "заготовк",
  "впрок",
  "хранить в морозил",
  "хранение в морозил",
];

function normalizeText(value) {
  return String(value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s-]/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRecipeTexts(recipe) {
  const title = normalizeText(recipe?.title || "");

  const ingredientParts = (Array.isArray(recipe?.ingredients) ? recipe.ingredients : [])
    .map((ingredient) => {
      if (typeof ingredient === "string") {
        return ingredient;
      }

      return [
        ingredient?.name,
        ingredient?.rawText ?? ingredient?.raw_text,
        ingredient?.section,
      ]
        .filter(Boolean)
        .join(" ");
    });

  const stepParts = (Array.isArray(recipe?.steps) ? recipe.steps : [])
    .map((step) => {
      if (typeof step === "string") {
        return step;
      }

      return [step?.section, step?.instruction ?? step?.text]
        .filter(Boolean)
        .join(" ");
    });

  const haystack = normalizeText(
    [title, ...ingredientParts, ...stepParts].join(" ")
  );

  return { title, haystack };
}

function countRuleMatches(haystack, rules) {
  const result = [];

  for (const rule of rules) {
    let score = 0;

    for (const keyword of rule.keywords) {
      const normalizedKeyword = normalizeText(keyword);

      if (!normalizedKeyword) {
        continue;
      }

      if (haystack.includes(normalizedKeyword)) {
        score += 1;
      }
    }

    if (score > 0) {
      result.push({ name: rule.name ?? rule.category ?? rule.tag, score });
    }
  }

  return result;
}

function pickCategory(matches) {
  if (!matches.length) {
    return null;
  }

  const sorted = [...matches].sort((first, second) => second.score - first.score);
  const leader = sorted[0];

  const tied = sorted.filter(
    (entry) => entry.score === leader.score
  );

  if (tied.length > 1) {
    return null;
  }

  return leader.name;
}

function collectTags(haystack) {
  const tags = [];

  for (const rule of TAG_RULES) {
    if (!rule.keywords.length) {
      continue;
    }

    const matched = rule.keywords.some((keyword) => {
      const normalizedKeyword = normalizeText(keyword);
      return Boolean(normalizedKeyword) && haystack.includes(normalizedKeyword);
    });

    if (matched && !tags.includes(rule.tag)) {
      tags.push(rule.tag);
    }
  }

  return tags;
}

function suggestWeeklyPrep(recipe) {
  const { title, haystack } = normalizeRecipeTexts(recipe);

  const blacklisted = WEEKLY_PREP_BLACKLIST.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return Boolean(normalizedKeyword) && haystack.includes(normalizedKeyword);
  });

  if (blacklisted) {
    return false;
  }

  function titleMatches(keywords) {
    return keywords.some((keyword) => {
      const normalizedKeyword = normalizeText(keyword);
      return Boolean(normalizedKeyword) && title.includes(normalizedKeyword);
    });
  }

  const strictMatched = titleMatches(WEEKLY_PREP_STRICT_WHITELIST);

  if (strictMatched) {
    return true;
  }

  const conditionalMatched = titleMatches(
    WEEKLY_PREP_CONDITIONAL_WHITELIST
  );

  if (!conditionalMatched) {
    return false;
  }

  const hasExplicitHint = WEEKLY_PREP_EXPLICIT_HINTS.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return Boolean(normalizedKeyword) && haystack.includes(normalizedKeyword);
  });

  return hasExplicitHint;
}

function suggestCategoryAndTags(recipe) {
  const { haystack } = normalizeRecipeTexts(recipe);

  const categoryMatches = countRuleMatches(haystack, CATEGORY_RULES);

  const category = pickCategory(categoryMatches);

  const tags = collectTags(haystack);

  if (suggestWeeklyPrep(recipe)) {
    if (!tags.includes("Заготовки на неделю")) {
      tags.push("Заготовки на неделю");
    }
  }

  const validTags = tags.filter((tag) => TAGS.includes(tag));

  return {
    categories: category ? [category] : [],
    tags: validTags,
  };
}

window.ReceptyTaxonomy = {
  CATEGORIES,
  TAGS,
  suggestCategoryAndTags,
  suggestWeeklyPrep,
};
