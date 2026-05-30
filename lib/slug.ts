/**
 * URL-safe slug utilities.
 *
 * slugify("Bakers Delight")  → "bakers-delight"
 * slugify("RACT")            → "ract"
 * slugify("Our DNA")         → "our-dna"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanumeric runs → hyphen
    .replace(/^-+|-+$/g, '')       // trim leading/trailing hyphens
    || 'untitled'
}
