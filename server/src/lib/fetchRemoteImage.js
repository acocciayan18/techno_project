// SSRF-hardened image downloader for the "import from URL" feature.
//
// Threats handled:
//   - non-http(s) schemes, embedded credentials                 -> rejected
//   - requests to private / loopback / link-local / reserved IPs -> rejected
//   - DNS rebinding (resolve public, connect private)            -> the vetted IP
//       from our lookup() is the one the socket actually connects to
//   - unsafe redirects to internal hosts                         -> every hop is
//       re-validated through the same lookup()
//   - oversized downloads                                        -> streamed with
//       a hard byte cap, aborted as soon as it is exceeded
//   - slow-loris / hanging hosts                                 -> per-attempt timeout
//   - non-image or spoofed content                               -> magic-byte sniff
//
// TEST-ONLY escape hatch: IMAGE_IMPORT_ALLOW_PRIVATE=true disables the private-IP
// block so the e2e suite can import from an in-process loopback server. It is OFF
// by default and must never be set in production.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { UPLOAD } from './constants.js';
import { assertAllowedImage } from './imageValidation.js';

const allowPrivate = () => process.env.IMAGE_IMPORT_ALLOW_PRIVATE === 'true';

function bad(msg) {
  return Object.assign(new Error(msg), { status: 400 });
}

// True for IPv4/IPv6 addresses that must never be reachable from a URL import.
export function isBlockedIp(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) {
    const o = ip.split('.').map(Number);
    if (o[0] === 0) return true; // 0.0.0.0/8
    if (o[0] === 10) return true; // 10/8
    if (o[0] === 127) return true; // loopback
    if (o[0] === 169 && o[1] === 254) return true; // link-local
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true; // 172.16/12
    if (o[0] === 192 && o[1] === 168) return true; // 192.168/16
    if (o[0] === 192 && o[1] === 0 && o[2] === 0) return true; // 192.0.0/24
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // CGNAT 100.64/10
    if (o[0] === 198 && (o[1] === 18 || o[1] === 19)) return true; // benchmarking
    if (o[0] >= 224) return true; // multicast + reserved (224/3)
    return false;
  }
  if (fam === 6) {
    const a = ip.toLowerCase();
    if (a === '::' || a === '::1') return true; // unspecified / loopback
    if (a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb')) return true; // link-local fe80::/10
    if (a.startsWith('fc') || a.startsWith('fd')) return true; // unique-local fc00::/7
    const m = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (m) return isBlockedIp(m[1]);
    return false;
  }
  return true; // not a valid IP literal -> block
}

// DNS lookup that rejects any resolved address in a blocked range. Passing this
// as the request's `lookup` option means the socket connects to exactly the IP we
// vetted (closing the DNS-rebinding window).
function guardedLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true, ...options }, (err, addresses) => {
    if (err) return cb(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family }];
    if (!allowPrivate()) {
      for (const a of list) {
        if (isBlockedIp(a.address)) {
          return cb(Object.assign(new Error('URL resolves to a disallowed address'), { status: 400 }));
        }
      }
    }
    const first = list[0];
    if (options.all) cb(null, list);
    else cb(null, first.address, first.family);
  });
}

function parseSafeUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw bad('Enter a valid image URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw bad('Image URL must start with http:// or https://');
  if (u.username || u.password) throw bad('Image URL must not contain credentials');
  // A literal-IP host never triggers DNS, so guardedLookup wouldn't see it — check
  // it here so private/loopback IP literals can't slip past the lookup guard.
  const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 [] brackets
  if (net.isIP(host) && !allowPrivate() && isBlockedIp(host)) {
    throw bad('URL resolves to a disallowed address');
  }
  return u;
}

// One GET, returning the raw response stream (no redirect following here).
function getOnce(u, timeoutMs) {
  const mod = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(
      u,
      {
        lookup: guardedLookup,
        headers: { Accept: 'image/*', 'User-Agent': 'TagBack-ImageImport/1.0' },
        timeout: timeoutMs,
      },
      (res) => resolve(res),
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('Image download timed out'), { status: 400 })));
    req.on('error', reject);
  });
}

// Download + validate an image from an untrusted URL. Returns { buffer, contentType }.
export async function downloadImage(rawUrl, { maxBytes = UPLOAD.MAX_BYTES, timeoutMs = UPLOAD.IMPORT_TIMEOUT_MS } = {}) {
  let u = parseSafeUrl(rawUrl);

  let res;
  for (let hop = 0; ; hop++) {
    res = await getOnce(u, timeoutMs);
    const status = res.statusCode || 0;

    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume(); // drain the redirect body
      if (hop >= UPLOAD.IMPORT_MAX_REDIRECTS) throw bad('Too many redirects while fetching the image');
      u = parseSafeUrl(new URL(res.headers.location, u).toString()); // re-validate each hop
      continue;
    }
    if (status !== 200) {
      res.resume();
      throw bad(`Could not fetch image (HTTP ${status || 'error'})`);
    }
    break;
  }

  const ct = String(res.headers.get?.('content-type') || res.headers['content-type'] || '').toLowerCase();
  if (ct && !ct.startsWith('image/')) {
    res.resume();
    throw bad('That URL did not return an image');
  }
  const declared = Number(res.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    res.resume();
    throw bad(`Image must be ${Math.round(maxBytes / (1024 * 1024))}MB or smaller`);
  }

  // Stream with a hard cap so a lying/absent content-length can't blow memory.
  const buffer = await new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    res.on('data', (c) => {
      total += c.length;
      if (total > maxBytes) {
        res.destroy();
        reject(bad(`Image must be ${Math.round(maxBytes / (1024 * 1024))}MB or smaller`));
        return;
      }
      chunks.push(c);
    });
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
  });

  // Final authority: the bytes must actually be an allowed image.
  const { contentType } = assertAllowedImage(buffer);
  return { buffer, contentType };
}
