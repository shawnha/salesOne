/**
 * Build a public tracking URL for a carrier + tracking number.
 * Returns null when the carrier is unknown / unmapped — caller should render
 * the tracking number as plain text instead of a link.
 */
export function getTrackingUrl(carrier: string | null, trackingNumber: string | null): string | null {
  if (!trackingNumber) return null;
  const t = trackingNumber.replace(/[\s-]/g, "");
  if (!t) return null;

  const c = (carrier ?? "").toLowerCase().replace(/[\s.]/g, "");

  // Korean carriers (CGETC default = CJ대한통운)
  if (c.includes("cj") || c.includes("대한통운")) {
    return `https://trace.cjlogistics.com/next/tracking.html?wblNo=${t}`;
  }
  if (c.includes("한진")) {
    return `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillSearchList.do?mCode=MN038&schLang=KR&wblnumText2=${t}`;
  }
  if (c.includes("로젠")) {
    return `https://www.ilogen.com/web/personal/trace/${t}`;
  }
  if (c.includes("우체국") || c.includes("epost")) {
    return `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${t}`;
  }
  if (c.includes("롯데")) {
    return `https://www.lotteglogis.com/home/reservation/tracking/index?invno=${t}`;
  }

  // International
  if (c.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${t}`;
  }
  if (c.includes("dhl")) {
    return `https://www.dhl.com/en/express/tracking.html?AWB=${t}`;
  }
  if (c.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${t}`;
  }
  if (c.includes("usps")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`;
  }
  if (c.includes("shopify") || c.includes("shippo")) {
    return `https://shipment.shopify.com/track/${t}`;
  }

  // CGETC "WILL CALL" or unknown — no public tracking
  return null;
}
