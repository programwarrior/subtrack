export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function appUrl(): string {
  if (typeof window === "undefined") return `${basePath}/`;
  return new URL(`${basePath}/`, window.location.origin).toString();
}
