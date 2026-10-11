export function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function initialsOf(name: string, fallback = "") {
  const words = (name.trim() || fallback.trim()).split(/\s+/).filter(Boolean);
  const first = words[0]?.charAt(0) ?? "";
  const last = words.length > 1 ? (words.at(-1)?.charAt(0) ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}
