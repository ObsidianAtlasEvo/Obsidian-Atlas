export function resolveAuthenticatedRouteUserId(
  atlasAuthUserId?: string | null,
  atlasSessionUserId?: string | null,
): string | null {
  return atlasAuthUserId ?? atlasSessionUserId ?? null;
}
