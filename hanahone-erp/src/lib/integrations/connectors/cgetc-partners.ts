import { authenticate, odooRpc } from "./cgetc";

interface CgetcCredentials {
  url: string; email: string; password: string; db: string;
}

export interface ContactInfo {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export function mapPartnerToContact(partner: any): ContactInfo {
  const contact: ContactInfo = { name: partner.name || "" };
  if (partner.email) contact.email = partner.email;
  if (partner.phone) contact.phone = partner.phone;
  if (partner.street) contact.address = partner.street;
  if (partner.city) contact.city = partner.city;
  if (partner.state_id?.[1]) contact.state = partner.state_id[1];
  if (partner.zip) contact.zip = partner.zip;
  return contact;
}

export async function fetchPartnerDetails(
  credentials: CgetcCredentials,
  partnerIds: number[],
): Promise<Map<number, ContactInfo>> {
  if (partnerIds.length === 0) return new Map();

  const sessionId = await authenticate(credentials.url, credentials.db, credentials.email, credentials.password);

  const partners = await odooRpc(credentials.url, sessionId, "res.partner", "read", [partnerIds], {
    fields: ["name", "email", "phone", "street", "city", "state_id", "zip", "country_id"],
  });

  const result = new Map<number, ContactInfo>();
  if (Array.isArray(partners)) {
    for (const p of partners) {
      result.set(p.id, mapPartnerToContact(p));
    }
  }
  return result;
}
