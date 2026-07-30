// Build the portable source bundle copied to C:\SargamWaveformWorker.
// Node.js and FFmpeg remain host prerequisites and are not redistributed.
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WAVEFORM_WORKER_OUTPUT = 'dist-waveform-worker';
export const WAVEFORM_WORKER_FILES = Object.freeze([
  ['scripts/sargam-waveform-worker.mjs', 'sargam-waveform-worker.mjs'],
  ['scripts/waveform-worker-core.mjs', 'waveform-worker-core.mjs'],
  ['waveform-worker/sargam-waveform-worker.config.json', 'sargam-waveform-worker.config.json'],
  ['waveform-worker/START-SARGAM-WAVEFORM-WORKER.cmd', 'START-SARGAM-WAVEFORM-WORKER.cmd'],
  ['waveform-worker/CHECK-SARGAM-WAVEFORM-WORKER.cmd', 'CHECK-SARGAM-WAVEFORM-WORKER.cmd'],
  ['waveform-worker/OPEN-WINDOWS-FIREWALL-AS-ADMIN.cmd', 'OPEN-WINDOWS-FIREWALL-AS-ADMIN.cmd'],
  ['waveform-worker/README.md', 'README.md'],
]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function buildWaveformWorkerBundle(root = projectRoot) {
  const output = path.join(root, WAVEFORM_WORKER_OUTPUT);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const files = [];
  for (const [sourceRelative, destinationRelative] of WAVEFORM_WORKER_FILES) {
    const source = path.join(root, sourceRelative);
    const destination = path.join(output, destinationRelative);
    await copyFile(source, destination);
    const bytes = await readFile(destination);
    files.push({
      path: destinationRelative,
      bytes: (await stat(destination)).size,
      sha256: sha256(bytes),
    });
  }
  await writeFile(
    path.join(output, 'sargam-waveform-worker-manifest.json'),
    `${JSON.stringify({
      name: 'Sargam Class-Audio Waveform Worker',
      files,
      hostPrerequisites: ['Node.js', 'ffmpeg.exe', 'ffprobe.exe'],
    }, null, 2)}\n`,
    'utf8',
  );
  console.log(`Sargam Waveform Worker bundle: ${output}`);
  console.log(`${files.length} files`);
  return { output, files };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await buildWaveformWorkerBundle();
}
