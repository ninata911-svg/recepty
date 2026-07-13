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
      // Проверка соединения Worker с базой D1
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

      // Получение каталога рецептов
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
            prep_minutes,
            cook_minutes,
            total_minutes,
            source_name,
            source_url,
            image_key,
            tips,
            serve_with,
            batch_tip,
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
          details: error instanceof Error
            ? error.message
            : String(error),
        },
        500
      );
    }
  },
};
