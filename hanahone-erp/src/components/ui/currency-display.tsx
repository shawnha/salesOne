interface CurrencyDisplayProps {
  amount: number; // always in USD
  exchangeRate: number; // KRW per 1 USD
  primaryCurrency: "USD" | "KRW";
  size?: "sm" | "lg";
}

const formatUSD = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatKRW = (n: number) =>
  `₩${Math.round(n).toLocaleString("ko-KR")}`;

export function CurrencyDisplay({ amount, exchangeRate, primaryCurrency, size = "lg" }: CurrencyDisplayProps) {
  const krwAmount = Math.round(amount * exchangeRate);
  const primarySize = size === "lg" ? "text-lg font-semibold" : "text-sm font-semibold";
  const subSize = size === "lg" ? "text-[11px]" : "text-[10px]";

  if (primaryCurrency === "USD") {
    return (
      <div>
        <p className={primarySize}>{formatUSD(amount)}</p>
        <p className={`${subSize} text-[var(--text-tertiary)]`}>{formatKRW(krwAmount)}</p>
      </div>
    );
  }

  return (
    <div>
      <p className={primarySize}>{formatKRW(krwAmount)}</p>
      <p className={`${subSize} text-[var(--text-tertiary)]`}>{formatUSD(amount)}</p>
    </div>
  );
}

// Helper to determine primary currency by company
export function getPrimaryCurrency(companyId: string | undefined, companies?: { id: string; name: string }[]): "USD" | "KRW" {
  if (!companyId) return "USD"; // Group view → USD
  if (!companies) return "USD";

  const company = companies.find(c => c.id === companyId);
  if (!company) return "USD";

  // HOI (인터내셔널) → USD, HOK/HOR → KRW
  const name = company.name.toLowerCase();
  if (name.includes("international") || name.includes("인터내셔널") || name.includes("hoi")) {
    return "USD";
  }
  return "KRW";
}
