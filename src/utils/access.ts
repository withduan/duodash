import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export function createAccessVerifier(issuer: string, audience: string, keys?: JWTVerifyGetKey) {
  const url = new URL(issuer);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.cloudflareaccess.com') ||
      url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Invalid Cloudflare Access issuer');
  }
  const canonicalIssuer = url.origin;
  const keySet = keys ?? createRemoteJWKSet(new URL('/cdn-cgi/access/certs', canonicalIssuer), {
    timeoutDuration: 5000,
    cacheMaxAge: 10 * 60 * 1000,
  });
  return async (token: string): Promise<boolean> => {
    try {
      await jwtVerify(token, keySet, {
        issuer: canonicalIssuer,
        audience,
        algorithms: ['RS256'],
        requiredClaims: ['iss', 'aud', 'exp', 'iat'],
      });
      return true;
    } catch {
      return false;
    }
  };
}

let cachedVerifier: ReturnType<typeof createAccessVerifier> | undefined;
let cachedConfiguration = '';

export async function checkAccess(request: Request): Promise<Response | null> {
  const issuer = process.env.CF_ACCESS_ISSUER || '';
  const audience = process.env.CF_ACCESS_AUD || '';
  // Unconfigured local development remains usable. Production fails closed.
  if (!issuer && !audience && !process.env.VERCEL && process.env.NODE_ENV !== 'production') return null;
  const deny = (status: number) => new Response(
    JSON.stringify({ error: status === 503 ? 'Access protection is not configured' : 'Cloudflare Access login required', loginUrl: 'https://duo.iduan.me/' }),
    { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' } },
  );
  if (!issuer || !audience) return deny(503);
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) return deny(403);
  try {
    const configuration = JSON.stringify([issuer, audience]);
    if (!cachedVerifier || cachedConfiguration !== configuration) {
      cachedVerifier = createAccessVerifier(issuer, audience);
      cachedConfiguration = configuration;
    }
    return await cachedVerifier(token) ? null : deny(403);
  } catch {
    return deny(503);
  }
}
