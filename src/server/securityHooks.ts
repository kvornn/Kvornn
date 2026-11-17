import fs from 'node:fs';
import net from 'node:net';

export interface MalwareScanResult {
  clean: boolean;
  scanStatus: 'CLEAN' | 'QUARANTINED' | 'UNSCANNED';
  engine: string;
  reason?: string;
}

const ACTIVE_PAYLOAD_PATTERNS = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /onerror\s*=/i,
  /onload\s*=/i,
  /<\?php/i,
];

/**
 * Malware & active-content scanning hook.
 * 1. Inspects text-based formats (txt, md, csv, json) for embedded active script signatures.
 * 2. When CLAMAV_SCAN_HOST is configured (host[:port]), streams file bytes to ClamAV clamd INSTREAM.
 */
export async function runMalwareScanHook(
  filePath: string,
  extension: string
): Promise<MalwareScanResult> {
  const buf = fs.readFileSync(filePath);

  if (['txt', 'md', 'csv', 'json'].includes(extension)) {
    const sample = buf.subarray(0, Math.min(buf.length, 512 * 1024)).toString('utf8');
    for (const pattern of ACTIVE_PAYLOAD_PATTERNS) {
      if (pattern.test(sample)) {
        return {
          clean: false,
          scanStatus: 'QUARANTINED',
          engine: 'sentarika-content-guard',
          reason: 'Embedded active script signature detected inside document',
        };
      }
    }
  }

  const clamHostRaw = (process.env.CLAMAV_SCAN_HOST || '').trim();
  if (clamHostRaw) {
    const [host, portStr] = clamHostRaw.split(':');
    const port = Number(portStr || 3310);
    const clamResult = await scanViaClamAv(host, port, buf);
    return clamResult;
  }

  return {
    clean: true,
    scanStatus: 'CLEAN',
    engine: 'sentarika-heuristic-guard',
  };
}

function scanViaClamAv(host: string, port: number, payload: Buffer): Promise<MalwareScanResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 8000 }, () => {
      socket.write('zINSTREAM\0');
      const chunkLen = Buffer.alloc(4);
      chunkLen.writeUInt32BE(payload.length, 0);
      socket.write(chunkLen);
      socket.write(payload);
      const end = Buffer.alloc(4);
      end.writeUInt32BE(0, 0);
      socket.write(end);
    });

    let response = '';
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
    });
    socket.on('end', () => {
      if (response.includes('OK')) {
        resolve({ clean: true, scanStatus: 'CLEAN', engine: 'clamav-clamd' });
      } else {
        resolve({
          clean: false,
          scanStatus: 'QUARANTINED',
          engine: 'clamav-clamd',
          reason: response.trim() || 'Malware detected by ClamAV',
        });
      }
    });
    socket.on('error', () => {
      resolve({
        clean: false,
        scanStatus: 'UNSCANNED',
        engine: 'clamav-clamd',
        reason: 'ClamAV daemon unreachable while CLAMAV_SCAN_HOST is configured',
      });
    });
  });
}
