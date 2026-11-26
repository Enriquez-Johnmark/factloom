/** Lower-cases text and turns every run of punctuation and spaces into one space, for matching. */
export function normaliseText(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Replaces each {name} in a template by the value of that name; unknown names stay as they are. */
export function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (placeholder, name) =>
    name in values ? String(values[name]) : placeholder,
  );
}
