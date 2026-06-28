import { defineTool } from "../core";
import type { Tool } from "../core";
import { state, asStr, asInt } from "./state";

export function knowledgeTools(): Tool[] {
  return [
    defineTool({
      name: "kb.search",
      description: "Search internal knowledge base articles by keyword.",
      permission: { category: "read" },
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keyword or phrase to search for." },
          limit: { type: "integer", minimum: 1, description: "Max results to return." },
        },
        required: ["query"],
      },
      async execute(args) {
        const query = (asStr(args.query) ?? "").trim().toLowerCase();
        if (!query) return { ok: false, error: "query is required" };
        const limit = asInt(args.limit) ?? 5;
        const terms = query.split(/\s+/).filter(Boolean);
        const matches = state.kbArticles
          .filter((a) => {
            const hay = `${a.title} ${a.summary} ${a.body} ${a.tags.join(" ")}`.toLowerCase();
            return terms.every((term) => hay.includes(term));
          })
          .slice(0, limit)
          .map((a) => ({ id: a.id, title: a.title, summary: a.summary, tags: a.tags }));
        return {
          ok: true,
          data: matches,
          note: `${matches.length} article(s) matched "${query}".`,
        };
      },
    }),
    defineTool({
      name: "kb.get_article",
      description: "Fetch a full knowledge base article by its id.",
      permission: { category: "read" },
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Article id." },
        },
        required: ["id"],
      },
      async execute(args) {
        const id = asStr(args.id);
        const article = state.kbArticles.find((a) => a.id === id);
        if (!article) return { ok: false, error: `No KB article with id ${id}` };
        return { ok: true, data: article, note: `Loaded article "${article.title}".` };
      },
    }),
  ];
}
