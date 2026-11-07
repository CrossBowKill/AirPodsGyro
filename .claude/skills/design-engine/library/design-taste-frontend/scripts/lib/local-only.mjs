// Local change: the audit scripts open local pages only.
// Accepts a local file path, a file: URL, or an http(s) URL on this machine. Refuses anything else.
import { fileURLToPath } from 'node:url';

export function localTarget(target) {
  if (!target || target.startsWith('-')) return target;
  if (/^file:/i.test(target)) return fileURLToPath(target);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return target;
  let host = '';
  try { host = new URL(target).hostname; } catch { /* handled below */ }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  if (!/^https?:/i.test(target) || !local) {
    console.error(`This script opens local pages only (localhost or a file on this machine), got: ${target}`);
    console.error('Run your site locally and point the script at that address, or pass the path to its index.html.');
    process.exit(2);
  }
  return target;
}
