import { getDb } from "./db";
import type { PortfolioItem } from "./types";

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2);

/**
 * Portfolio items whose tagged skills overlap the project. Only items the user
 * entered themselves are ever returned — the writer is told never to invent work.
 */
export function matchPortfolio(projectSkills: string[], title: string, limit = 2): PortfolioItem[] {
  const items = getDb().prepare("SELECT * FROM portfolio").all() as PortfolioItem[];
  const want = new Set([...projectSkills.flatMap(tokens), ...tokens(title)]);
  return items
    .map((item) => {
      const have = new Set([...(JSON.parse(item.skills || "[]") as string[]).flatMap(tokens), ...tokens(item.title)]);
      let score = 0;
      for (const w of have) if (want.has(w)) score++;
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
}
