export function buildCompanyFilter(companyId: string | null): Record<string, string> {
  if (!companyId) return {};
  return { companyId };
}
