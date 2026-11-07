// Builds the map away from the server, so a slow read can never stop it answering.
import { parentPort } from 'node:worker_threads';
import { extract, writeWorld } from './extract.mjs';
import { allowedFiles } from './guard.mjs';

try {
  const world = writeWorld(extract());
  parentPort.postMessage({ json: JSON.stringify(world), files: [...allowedFiles(world)] });
} catch (err) {
  parentPort.postMessage({ error: String((err && err.message) || err).split('\n')[0].slice(0, 300) });
}
