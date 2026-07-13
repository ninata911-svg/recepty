function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // Проверка соединения с D1.
      if (
        request.method === "GET" &&
        url.pathname === "/api/health"
      ) {
        const result = await env.DB
          .prepare("SELECT 1 AS ok")
          .first();

        return jsonResponse({
          success: result?.ok === 1,
          database: "recepty-db",
        });
      }

      // Общий каталог рецептов.
      if (
        request.method === "GET" &&
        url.pathname === "/api/recipes"
      ) {
        const result = await env.DB.prepare(`
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
            tips,
            serve_with,
            batch_tip,
            highlight,
            is_verified,
            is_weekly_prep,
            is_favorite,
            created_at,
            updated_at
          FROM recipes
          WHERE deleted_at IS NULL
          ORDER BY title COLLATE NOCASE
        `).all();

        return jsonResponse({
          success: true,
          items: result.results ?? [],
        });
      }

      // Полная карточка отдельного рецепта.
      const recipeMatch = url.pathname.match(
        /^\/api\/recipes\/([^/]+)$/
      );

      if (request.method === "GET" && recipeMatch) {
        const slug = decodeURIComponent(recipeMatch[1]);

        const recipe = await env.DB.prepare(`
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
          env.DB.prepare(`
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

          env.DB.prepare(`
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

          env.DB.prepare(`
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

          env.DB.prepare(`
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
            ingredients: ingredientsResult.results ?? [],
            steps: stepsResult.results ?? [],
            categories: categoriesResult.results ?? [],
            tags: tagsResult.results ?? [],
          },
        });
      }

      return jsonResponse(
        {
          success: false,
          error: "API route not found",
        },
        404
      );
    } catch (error) {
      console.error(error);

      return jsonResponse(
        {
          success: false,
          error: "Database request failed",
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
