export function newId(prefix: string): string {
  const raw = crypto.randomUUID().replaceAll("-", "");
  return `${prefix}_${raw.slice(0, 16)}`;
}

export function slugId(prefix: string, name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  return `${prefix}_${slug}`;
}
