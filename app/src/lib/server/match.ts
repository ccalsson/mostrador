import type { Producto } from "@/lib/types";

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(s: string): string[] {
  return fold(s).split(" ").filter((t) => t.length > 1);
}

export function matchProduct(description: string, productos: Producto[]): { producto: Producto | null; score: number } {
  const needle = fold(description);
  if (!needle) return { producto: null, score: 0 };
  let best: Producto | null = null;
  let bestScore = 0;
  for (const p of productos) {
    const names = [p.nombre, ...p.alias];
    for (const n of names) {
      const hay = fold(n);
      if (!hay) continue;
      let score = 0;
      if (hay === needle) score = 1;
      else if (hay.includes(needle) || needle.includes(hay)) score = 0.9;
      else {
        const a = new Set(tokenSet(needle));
        const b = new Set(tokenSet(hay));
        if (a.size && b.size) {
          let inter = 0;
          for (const t of a) if (b.has(t)) inter += 1;
          score = inter / Math.max(a.size, b.size);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }
  if (bestScore < 0.35) return { producto: null, score: bestScore };
  return { producto: best, score: Math.round(bestScore * 100) / 100 };
}
