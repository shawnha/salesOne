export function canAccessCompany(
  role: string,
  userCompanyId: string,
  targetCompanyId: string | null
): boolean {
  if (role === "ADMIN") return true;
  if (targetCompanyId === null) return false;
  return userCompanyId === targetCompanyId;
}

export function getAccessibleCompanyIds(
  role: string,
  userCompanyId: string,
  allCompanyIds: string[]
): string[] {
  if (role === "ADMIN") return allCompanyIds;
  return [userCompanyId];
}
