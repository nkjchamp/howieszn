import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { RequestError } from './validation.ts';

export interface PreviewOptions {
  username: string;
  password: string;
  allowedOrigins: string[];
  staticDir: string;
}

export const PREVIEW_CHALLENGE = 'Basic realm="Howieszn private preview", charset="UTF-8"';
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
const IMAGES = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico']);
const SECRET_NAME = /^(?:\.env(?:\..*)?|credentials?(?:[._-].*)?|secrets?(?:[._-].*)?|id_rsa(?:\..*)?|id_ed25519(?:\..*)?|private[._-]?key(?:\..*)?)$/i;

function within(root: string, file: string): boolean {
  const name = relative(root, file);
  return name !== '..' && !name.startsWith(`..${sep}`) && !isAbsolute(name);
}
function hiddenOrSecret(pathname: string): boolean {
  return pathname.split(/[\\/]/).some(part => part.startsWith('.') || SECRET_NAME.test(part));
}
function origin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Preview allowedOrigins must contain exact absolute origins.'); }
  if (url.origin !== value || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw new Error('Preview allowedOrigins must contain canonical origins without paths, credentials, or trailing slashes.');
  if (url.protocol !== 'https:' && !LOOPBACK.has(url.hostname)) throw new Error('Public preview origins require HTTPS; HTTP is allowed only for loopback development.');
  return url.origin;
}

/** Validate the complete gate before opening or creating any league database. */
export function preparePreview(options: PreviewOptions) {
  if (!options || typeof options !== 'object') throw new Error('Preview configuration is required.');
  if (typeof options.username !== 'string' || !/^[A-Za-z0-9._-]{3,64}$/.test(options.username)) throw new Error('Preview username must contain 3–64 URL-safe characters.');
  if (typeof options.password !== 'string' || !options.password.trim() || CONTROL.test(options.password) || Buffer.byteLength(options.password, 'utf8') < 32 || Buffer.byteLength(options.password, 'utf8') > 1024) throw new Error('Preview password must contain at least 32 UTF-8 bytes, be nonblank, and contain no control characters.');
  if (!Array.isArray(options.allowedOrigins) || options.allowedOrigins.length === 0 || options.allowedOrigins.length > 32 || options.allowedOrigins.some(item => typeof item !== 'string')) throw new Error('Configure at least one exact preview origin.');
  const allowed = new Set(options.allowedOrigins.map(origin));
  let root: string;
  try {
    if (typeof options.staticDir !== 'string' || !options.staticDir.trim()) throw new Error('missing');
    root = realpathSync(resolve(options.staticDir));
    if (!statSync(root).isDirectory()) throw new Error('not a directory');
    const index = realpathSync(join(root, 'index.html'));
    if (!within(root, index) || hiddenOrSecret(relative(root, index)) || !statSync(index).isFile()) throw new Error('unsafe index');
  } catch { throw new Error('Preview staticDir must contain a built application with a safe index.html.'); }
  const expected = createHash('sha256').update(`${options.username}:${options.password}`, 'utf8').digest();

  return {
    authenticated(request: IncomingMessage): boolean {
      const header = request.headers.authorization;
      let candidate = Buffer.alloc(0), valid = false;
      if (typeof header === 'string' && header.length <= 2048) {
        const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
        if (match) {
          try {
            candidate = Buffer.from(match[1], 'base64');
            const text = new TextDecoder('utf-8', { fatal: true }).decode(candidate);
            valid = candidate.toString('base64') === match[1] && text.includes(':') && !CONTROL.test(text);
          } catch { candidate = Buffer.alloc(0); }
        }
      }
      const actual = createHash('sha256').update(candidate).digest();
      const equal = timingSafeEqual(expected, actual);
      return valid && equal;
    },
    allowsOrigin(value: string | undefined): boolean { return value === undefined || allowed.has(value); },
    async serve(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
      if (request.method !== 'GET' && request.method !== 'HEAD') return false;
      if (pathname === '/api' || pathname.startsWith('/api/') || pathname === '/events' || pathname === '/healthz') return false;
      const extension = extname(pathname).toLowerCase();
      let candidate: string;
      if (pathname === '/' || pathname === '/index.html') candidate = join(root, 'index.html');
      else if (pathname.startsWith('/assets/') && TYPES[extension] && !['.html', '.webmanifest', '.txt'].includes(extension)) candidate = resolve(root, `.${pathname}`);
      else if (IMAGES.has(extension) || pathname === '/manifest.webmanifest' || pathname === '/robots.txt') candidate = resolve(root, `.${pathname}`);
      else if (!extension && wantsHtml(request.headers.accept)) candidate = join(root, 'index.html');
      else return false;
      let file: string;
      let size: number;
      try {
        file = await realpath(candidate);
        if (!within(root, file) || hiddenOrSecret(relative(root, file))) return false;
        const details = await stat(file);
        if (!details.isFile()) return false;
        size = details.size;
      } catch { return false; }
      const contentType = TYPES[extname(file).toLowerCase()];
      if (!contentType) return false;
      const hashed = pathname.startsWith('/assets/') && /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(pathname);
      const headers = {
        'Content-Type': contentType, 'Content-Length': size,
        'Cache-Control': contentType.startsWith('text/html') ? 'no-store' : hashed ? 'private, max-age=31536000, immutable' : 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff', 'Vary': 'Authorization, Origin',
      };
      if (request.method === 'HEAD') { response.writeHead(200, headers); response.end(); return true; }
      // Read before sending headers so a file access failure returns a bounded error.
      const content = await readFile(file);
      response.writeHead(200, { ...headers, 'Content-Length': content.byteLength }); response.end(content); return true;
    },
  };
}

function wantsHtml(value: string | undefined): boolean {
  return Boolean(value?.split(',').some(item => {
    const [type, ...parameters] = item.trim().toLowerCase().split(';');
    return type === 'text/html' && !parameters.some(parameter => /^q\s*=\s*0(?:\.0*)?$/.test(parameter.trim()));
  }));
}

/** Reject dangerous forms before WHATWG URL normalization can erase traversal. */
export function previewPath(target: string): string {
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('#')) throw new RequestError(400, 'INVALID_PATH', 'Invalid preview request path.');
  let pathname: string;
  try { pathname = decodeURIComponent(target.split('?')[0]); } catch { throw new RequestError(400, 'INVALID_PATH', 'Invalid preview request path.'); }
  if (pathname.includes('\\') || pathname.includes('%') || CONTROL.test(pathname) || pathname.split('/').some(part => part === '.' || part === '..')) throw new RequestError(400, 'INVALID_PATH', 'Invalid preview request path.');
  if (hiddenOrSecret(pathname)) throw new RequestError(404, 'NOT_FOUND', 'Unknown preview route.');
  return pathname;
}
