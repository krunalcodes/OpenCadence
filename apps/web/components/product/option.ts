export type Option = { value: string; label: string };

export function sameOption(a: Option, b: Option) {
  return a.value === b.value;
}
