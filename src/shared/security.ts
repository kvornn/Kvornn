import crypto from 'node:crypto';

// Ambiguity-free cryptographic alphabet (31 characters, excludes O/0, I/1/L)
export const ACCESS_KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ACCESS_KEY_LENGTH = 30;

// Backwards-compatible aliases
export const INVITE_KEY_LENGTH = ACCESS_KEY_LENGTH;

/**
 * Generates a high-entropy 30-character cryptographic access key using Node CSPRNG
 * with unbiased rejection sampling (never Math.random()).
 */
export function generateAccessKey(): string {
  const alphabetLen = ACCESS_KEY_ALPHABET.length; // 31
  const maxValidByte = Math.floor(256 / alphabetLen) * alphabetLen; // 248 (unbiased)
  let out = '';

  while (out.length < ACCESS_KEY_LENGTH) {
    const chunk = crypto.randomBytes(64);
    for (let i = 0; i < chunk.length && out.length < ACCESS_KEY_LENGTH; i++) {
      const b = chunk[i];
      if (b < maxValidByte) {
        out += ACCESS_KEY_ALPHABET[b % alphabetLen];
      }
    }
  }
  return out;
}

export const generateInviteKey = generateAccessKey;

export function normalizeAccessKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const normalizeInviteKey = normalizeAccessKey;

export function isValidAccessKeyFormat(raw: string): boolean {
  const normalized = normalizeAccessKey(raw);
  if (normalized.length !== ACCESS_KEY_LENGTH) return false;
  for (const ch of normalized) {
    if (!ACCESS_KEY_ALPHABET.includes(ch)) return false;
  }
  return true;
}

export const isValidInviteKeyFormat = isValidAccessKeyFormat;

export function hashAccessKey(normalizedKey: string, pepper: string): string {
  return crypto
    .createHmac('sha256', pepper)
    .update(`sentarika-key-v2:${normalizedKey}`)
    .digest('hex');
}

export const hashInviteKey = hashAccessKey;

export function timingSafeHexEquals(aHex: string, bHex: string): boolean {
  if (!/^[a-f0-9]+$/i.test(aHex) || !/^[a-f0-9]+$/i.test(bHex)) return false;
  if (aHex.length !== bHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(aHex, 'hex'), Buffer.from(bHex, 'hex'));
}

export function hashAuditIdentifier(raw: string, pepper: string): string {
  return crypto.createHmac('sha256', pepper).update(raw).digest('hex').slice(0, 16);
}

// Strict file upload allowlist & active-content defense
const BLOCKED_EXTENSIONS = new Set([
  'html',
  'htm',
  'xhtml',
  'svg',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'php',
  'phtml',
  'asp',
  'aspx',
  'jsp',
  'exe',
  'dll',
  'bat',
  'cmd',
  'sh',
  'bash',
  'ps1',
  'msi',
  'vbs',
  'scr',
]);

const ALLOWED_EXTENSION_MIME: Record<string, string[]> = {
  pdf: ['application/pdf'],
  txt: ['text/plain'],
  md: ['text/markdown', 'text/plain'],
  csv: ['text/csv', 'text/plain', 'application/csv'],
  json: ['application/json', 'text/plain'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  zip: ['application/zip', 'application/x-zip-compressed'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export function sanitizeFilename(originalName: string): string {
  const base = originalName.split(/[/\\]/).pop() || 'document';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
  return cleaned.slice(0, 120) || 'document';
}

export interface UploadValidationResult {
  valid: boolean;
  reason?: string;
  extension: string;
  sanitizedName: string;
}

export function validateUploadFile(
  originalName: string,
  mimeType: string,
  sizeBytes: number,
  magicBytes?: Buffer
): UploadValidationResult {
  const sanitizedName = sanitizeFilename(originalName);
  const parts = sanitizedName.toLowerCase().split('.');
  const extension = parts.length > 1 ? parts.pop()! : '';

  if (!extension || BLOCKED_EXTENSIONS.has(extension)) {
    return {
      valid: false,
      reason: `Blocked or unsafe file extension: .${extension || 'none'}`,
      extension,
      sanitizedName,
    };
  }

  // Block double-extension active tricks like payload.html.txt or shell.php.jpg
  for (const part of parts) {
    if (BLOCKED_EXTENSIONS.has(part)) {
      return {
        valid: false,
        reason: `Blocked compound extension segment: .${part}`,
        extension,
        sanitizedName,
      };
    }
  }

  const allowedMimes = ALLOWED_EXTENSION_MIME[extension];
  if (!allowedMimes) {
    return {
      valid: false,
      reason: `Unsupported file extension: .${extension}`,
      extension,
      sanitizedName,
    };
  }

  const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
  if (!allowedMimes.includes(normalizedMime)) {
    return {
      valid: false,
      reason: `MIME mismatch for .${extension}: received ${normalizedMime}`,
      extension,
      sanitizedName,
    };
  }

  if (sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    return {
      valid: false,
      reason: `File size out of bounds (1B - ${MAX_UPLOAD_BYTES}B)`,
      extension,
      sanitizedName,
    };
  }

  // Magic-byte verification for critical binary types
  if (magicBytes && magicBytes.length >= 4) {
    if (extension === 'pdf' && magicBytes.subarray(0, 4).toString('ascii') !== '%PDF') {
      return { valid: false, reason: 'Invalid PDF magic header', extension, sanitizedName };
    }
    if (
      extension === 'png' &&
      !(magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4e && magicBytes[3] === 0x47)
    ) {
      return { valid: false, reason: 'Invalid PNG magic header', extension, sanitizedName };
    }
    if ((extension === 'jpg' || extension === 'jpeg') && !(magicBytes[0] === 0xff && magicBytes[1] === 0xd8)) {
      return { valid: false, reason: 'Invalid JPEG magic header', extension, sanitizedName };
    }
    if (
      extension === 'webp' &&
      (magicBytes.length < 12 ||
        magicBytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
        magicBytes.subarray(8, 12).toString('ascii') !== 'WEBP')
    ) {
      return { valid: false, reason: 'Invalid WEBP magic header', extension, sanitizedName };
    }
    if (
      (extension === 'zip' || extension === 'docx' || extension === 'xlsx') &&
      !(magicBytes[0] === 0x50 && magicBytes[1] === 0x4b)
    ) {
      return { valid: false, reason: 'Invalid ZIP container magic header', extension, sanitizedName };
    }
  }

  return { valid: true, extension, sanitizedName };
}

export function signDownloadToken(
  fileId: string,
  userId: string,
  expiresAtMs: number,
  secret: string
): string {
  const payload = `${fileId}:${userId}:${expiresAtMs}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyDownloadToken(
  fileId: string,
  userId: string,
  expiresAtMs: number,
  signatureHex: string,
  secret: string,
  nowMs = Date.now()
): boolean {
  if (!Number.isFinite(expiresAtMs) || nowMs > expiresAtMs) return false;
  if (!/^[a-f0-9]{64}$/i.test(signatureHex)) return false;
  const expected = signDownloadToken(fileId, userId, expiresAtMs, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface AuditChainRecord {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  prevHash: string;
  createdAt: string;
  entryHash?: string;
}

export function computeAuditHash(record: Omit<AuditChainRecord, 'entryHash'>): string {
  const canonical = JSON.stringify({
    actorId: record.actorId,
    action: record.action,
    targetType: record.targetType,
    targetId: record.targetId,
    summary: record.summary,
    prevHash: record.prevHash,
    createdAt: record.createdAt,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function verifyAuditChain(records: AuditChainRecord[]): { valid: boolean; brokenIndex: number | null } {
  let expectedPrev = 'GENESIS';
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.prevHash !== expectedPrev) {
      return { valid: false, brokenIndex: i };
    }
    const recomputed = computeAuditHash({
      actorId: r.actorId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      summary: r.summary,
      prevHash: r.prevHash,
      createdAt: r.createdAt,
    });
    if (r.entryHash !== recomputed) {
      return { valid: false, brokenIndex: i };
    }
    expectedPrev = recomputed;
  }
  return { valid: true, brokenIndex: null };
}
