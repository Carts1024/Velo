export type ProjectMetadataInput = {
  name: string;
  slug: string;
  description: string;
  website: string;
  ownerAddress: string;
};

export function slugifyProjectName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function buildProjectMetadata(input: ProjectMetadataInput) {
  return {
    name: input.name.trim(),
    slug: input.slug.trim().toLowerCase(),
    description: input.description.trim(),
    website: input.website.trim() || null,
    ownerAddress: input.ownerAddress.trim().toUpperCase(),
    network: "testnet",
    schema: "velo.project.v1",
  };
}

export function stableJson(value: unknown) {
  return JSON.stringify(sortValue(value), null, 2);
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }

  return value;
}
