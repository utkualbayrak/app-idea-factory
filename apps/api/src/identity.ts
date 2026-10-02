import type { NextFunction, Request, Response } from "express";
import { env } from "cloudflare:workers";

// "En son kim güncelledi" için isteği yapan kişi. Cloudflare Access her isteğe
// imzalı bir JWT (Cf-Access-Jwt-Assertion) ekler; web Worker'ın /api proxy'si
// başlıkları olduğu gibi taşır. Cf-Access-Authenticated-User-Email başlığına
// körü körüne güvenilmez, JWT Access'in açık anahtarlarıyla doğrulanır.
//
// - Kullanıcı girişi → JWT'deki e-posta
// - Service token (GitHub Actions) → SYSTEM_ACTOR (JWT'de email yok, common_name var)
// - Doğrulanamazsa → null. İstek reddedilmez (edge'de Access zaten koruyor),
//   yalnızca "kim" boş kalır.

export const SYSTEM_ACTOR = "system";

interface IdentityEnv {
  /** Örn. "takim.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN?: string;
  /** Virgülle ayrılmış AUD tag'leri: web uygulaması (proxy) + API uygulaması (doğrudan). */
  ACCESS_AUDS?: string;
  /** Yalnızca local dev (.dev.vars): JWT olmayan isteklerin aktörü. */
  DEV_ACTOR_EMAIL?: string;
}

interface Jwk extends JsonWebKey {
  kid: string;
}

interface AccessClaims {
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
  email?: string;
  common_name?: string;
}

const CERTS_TTL_MS = 60 * 60 * 1000;
let certs: { domain: string; keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;

async function loadKeys(domain: string): Promise<Map<string, CryptoKey>> {
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs HTTP ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  const imported = await Promise.all(
    keys.map(async (jwk) => {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      return [jwk.kid, key] as const;
    }),
  );
  return new Map(imported);
}

// Anahtarlar modül kapsamında saklanır; bilinmeyen bir kid (anahtar rotasyonu)
// ya da süre dolması yeniden çekmeyi tetikler.
async function keyFor(domain: string, kid: string): Promise<CryptoKey | undefined> {
  const fresh = certs && certs.domain === domain && Date.now() - certs.fetchedAt < CERTS_TTL_MS;
  if (!fresh || !certs?.keys.has(kid)) {
    certs = { domain, keys: await loadKeys(domain), fetchedAt: Date.now() };
  }
  return certs.keys.get(kid);
}

function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as T;
}

async function verifyAccessJwt(token: string, domain: string, auds: string[]): Promise<AccessClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = decodeJson<{ alg?: string; kid?: string }>(headerPart);
  if (header.alg !== "RS256" || !header.kid) return null;

  const key = await keyFor(domain, header.kid);
  if (!key) return null;

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlDecode(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) return null;

  const claims = decodeJson<AccessClaims>(payloadPart);
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== `https://${domain}`) return null;
  if (typeof claims.exp !== "number" || claims.exp < now) return null;
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) return null;
  const tokenAuds = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!tokenAuds.some((aud) => auds.includes(aud))) return null;
  return claims;
}

export async function resolveActor(req: Request, res: Response, next: NextFunction) {
  const { ACCESS_TEAM_DOMAIN, ACCESS_AUDS, DEV_ACTOR_EMAIL } = env as unknown as IdentityEnv;
  const token = req.header("Cf-Access-Jwt-Assertion");
  let actor: string | null = null;

  if (token && ACCESS_TEAM_DOMAIN && ACCESS_AUDS) {
    try {
      const auds = ACCESS_AUDS.split(",").map((a) => a.trim()).filter(Boolean);
      const claims = await verifyAccessJwt(token, ACCESS_TEAM_DOMAIN, auds);
      if (claims?.email) actor = claims.email.toLowerCase();
      else if (claims?.common_name) actor = SYSTEM_ACTOR;
      if (!claims) console.warn("Access JWT doğrulanamadı; aktör boş bırakıldı.");
    } catch (err) {
      console.warn("Access JWT doğrulaması hata verdi; aktör boş bırakıldı.", err);
    }
  } else if (!token && DEV_ACTOR_EMAIL) {
    actor = DEV_ACTOR_EMAIL.toLowerCase();
  }

  res.locals.actor = actor;
  next();
}

export function actorOf(res: Response): string | null {
  return (res.locals.actor as string | null | undefined) ?? null;
}
