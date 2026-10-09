import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { createAccessVerifier, checkAccess } from '../src/utils/access.ts';

const issuer = 'https://test.cloudflareaccess.com';
const audience = 'test-application';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const verify = createAccessVerifier(issuer, audience, async () => publicKey);
const sign = (overrides: Record<string, unknown> = {}) => new SignJWT({
  iss: issuer, aud: audience, iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 300, ...overrides,
}).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);

test('accepts correctly signed application JWT', async () => assert.equal(await verify(await sign()), true));
test('rejects expired, wrong audience, wrong issuer and missing expiry', async () => {
  for (const claims of [{ exp: 1 }, { aud: 'another-app' }, { iss: 'https://other.cloudflareaccess.com' }, { exp: undefined }]) {
    assert.equal(await verify(await sign(claims)), false);
  }
});
test('rejects forged signatures and malformed tokens', async () => {
  const other = await generateKeyPair('RS256');
  const forged = await new SignJWT({ iss: issuer, aud: audience }).setProtectedHeader({ alg: 'RS256' }).setIssuedAt().setExpirationTime('5m').sign(other.privateKey);
  assert.equal(await verify(forged), false);
  assert.equal(await verify('fake'), false);
});
test('rejects untrusted issuer URLs', () => {
  for (const url of ['http://test.cloudflareaccess.com', 'https://evil.example', issuer + '/path']) {
    assert.throws(() => createAccessVerifier(url, audience));
  }
});
test('production denies missing configuration, and token/Origin cannot bypass Access', async () => {
  const original = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.CF_ACCESS_ISSUER;
    delete process.env.CF_ACCESS_AUD;
    assert.equal((await checkAccess(new Request('https://example.com/')))?.status, 503);
    process.env.CF_ACCESS_ISSUER = issuer;
    process.env.CF_ACCESS_AUD = audience;
    const response = await checkAccess(new Request('https://example.com/api/data?token=secret', {
      headers: { Origin: 'https://example.com', Authorization: 'Bearer secret' },
    }));
    assert.equal(response?.status, 403);
    assert.equal(response?.headers.get('cache-control'), 'private, no-store');
  } finally {
    for (const key of ['NODE_ENV', 'CF_ACCESS_ISSUER', 'CF_ACCESS_AUD']) {
      if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
    }
  }
});
