import { AccountStatus } from '../shared/types';

export class ApiError extends Error {
  status: number;
  code: string;
  ban?: { status: AccountStatus; reason: string; expiresAt: string | null };
  resolution?: unknown;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code: string,
    extra?: {
      ban?: { status: AccountStatus; reason: string; expiresAt: string | null };
      resolution?: unknown;
      details?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.ban = extra?.ban;
    this.resolution = extra?.resolution;
    this.details = extra?.details;
  }
}

function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

export async function apiRequest<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = getCookie('sentarika_csrf');
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await response.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    throw new ApiError(
      data.error || `Request failed (${response.status})`,
      response.status,
      data.code || 'REQUEST_FAILED',
      {
        ban: data.ban,
        resolution: data.resolution,
        details: data,
      }
    );
  }

  return data as T;
}

export function uploadWithProgress<T = any>(
  url: string,
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.withCredentials = true;

    const csrf = getCookie('sentarika_csrf');
    if (csrf) {
      xhr.setRequestHeader('X-CSRF-Token', csrf);
    }

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
      }
    };

    xhr.onload = () => {
      let data: any = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        data = { error: xhr.responseText || `Upload failed (${xhr.status})` };
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve(data as T);
      } else {
        reject(
          new ApiError(
            data.error || `Upload failed (${xhr.status})`,
            xhr.status,
            data.code || 'UPLOAD_FAILED',
            { details: data }
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new ApiError('Network error during file upload', 0, 'NETWORK_ERROR'));
    };

    xhr.send(formData);
  });
}

