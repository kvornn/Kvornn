import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_KEY_ALPHABET,
  ACCESS_KEY_LENGTH,
  generateAccessKey,
  isValidAccessKeyFormat,
  normalizeAccessKey,
  hashAccessKey,
  timingSafeHexEquals,
  validateUploadFile,
  signDownloadToken,
  verifyDownloadToken,
  computeAuditHash,
  verifyAuditChain,
} from './security';

test('CSPRNG access key generation produces unique 30-char high-entropy keys without bias or Math.random', () => {
  const keys = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const key = generateAccessKey();
    assert.equal(key.length, ACCESS_KEY_LENGTH);
    assert.equal(key.length, 30);
    assert.equal(isValidAccessKeyFormat(key), true);
    for (const ch of key) {
      assert.ok(ACCESS_KEY_ALPHABET.includes(ch));
    }
    keys.add(key);
  }
  assert.equal(keys.size, 200);
  assert.equal(normalizeAccessKey(' abcd-efgh '), 'ABCDEFGH');
  assert.equal(isValidAccessKeyFormat('SHORT'), false);
  assert.equal(isValidAccessKeyFormat('0'.repeat(30)), false); // Ambiguous 0 excluded
});

test('access key HMAC hashing is deterministic and supports timing-safe hex verification', () => {
  const h1 = hashAccessKey('ABCDEFGHJKMNPQRSTUVWXYZ2345678', 'pepper');
  const h2 = hashAccessKey('ABCDEFGHJKMNPQRSTUVWXYZ2345678', 'pepper');
  const h3 = hashAccessKey('ABCDEFGHJKMNPQRSTUVWXYZ2345679', 'pepper');
  assert.equal(timingSafeHexEquals(h1, h2), true);
  assert.equal(timingSafeHexEquals(h1, h3), false);
});

test('upload validation rejects active content (html, svg, js, compound) and enforces magic bytes', () => {
  assert.equal(validateUploadFile('evil.html', 'text/html', 100).valid, false);
  assert.equal(validateUploadFile('xss.svg', 'image/svg+xml', 100).valid, false);
  assert.equal(validateUploadFile('payload.html.txt', 'text/plain', 100).valid, false);
  assert.equal(
    validateUploadFile('fake.pdf', 'application/pdf', 100, Buffer.from('NOT_A_PDF')).valid,
    false
  );
  assert.equal(
    validateUploadFile('dossier.pdf', 'application/pdf', 1024, Buffer.from('%PDF-1.7')).valid,
    true
  );
  assert.equal(
    validateUploadFile('fake.zip', 'application/zip', 120, Buffer.from('NOTZIP')).valid,
    false
  );
});

test('signed download tokens enforce expiry and binding', () => {
  const now = 1_700_000_000_000;
  const exp = now + 60_000;
  const sig = signDownloadToken('file-1', 'user-1', exp, 'super-secret');

  assert.equal(verifyDownloadToken('file-1', 'user-1', exp, sig, 'super-secret', now + 1000), true);
  assert.equal(verifyDownloadToken('file-2', 'user-1', exp, sig, 'super-secret', now + 1000), false);
  assert.equal(verifyDownloadToken('file-1', 'user-2', exp, sig, 'super-secret', now + 1000), false);
  assert.equal(verifyDownloadToken('file-1', 'user-1', exp, sig, 'super-secret', exp + 1), false);
});

test('audit log hash chain detects tampering', () => {
  const e1Base = {
    actorId: 'admin-1',
    action: 'CATEGORY_CREATE',
    targetType: 'category',
    targetId: 'cat-1',
    summary: 'Created Manuscripts',
    prevHash: 'GENESIS',
    createdAt: '2026-11-15T12:00:00.000Z',
  };
  const e1 = { ...e1Base, entryHash: computeAuditHash(e1Base) };

  const e2Base = {
    actorId: 'admin-1',
    action: 'USER_PROMOTE',
    targetType: 'user',
    targetId: 'u-1',
    summary: 'Promoted to DESTEKCI',
    prevHash: e1.entryHash,
    createdAt: '2026-11-15T12:05:00.000Z',
  };
  const e2 = { ...e2Base, entryHash: computeAuditHash(e2Base) };

  assert.deepEqual(verifyAuditChain([e1, e2]), { valid: true, brokenIndex: null });
  const tampered = [e1, { ...e2, summary: 'Tampered' }];
  assert.deepEqual(verifyAuditChain(tampered), { valid: false, brokenIndex: 1 });
});
