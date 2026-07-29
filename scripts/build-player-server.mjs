// Build the static Sargam Player payload served beside /classaudio/.
// Node is required only on the development Mac for this copy step. The
// resulting folder contains plain browser files and needs no runtime install.
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
export const PLAYER_SERVER_OUTPUT = 'dist-player';
export const PLAYER_SERVER_FILES = Object.freeze([
  'public/sargam-player/index.html',
  'public/vilambit.html',
  'public/vilambit/vilambit-app.js',
  'public/vilambit/vilambit-core.js',
  'public/vilambit/vilambit-remote-waveform.js',
  'public/vilambit/vilambit.css',
  'public/vilambit/vendor/libflac.js',
  'public/vilambit/vendor/signalsmith-stretch.js',
  'docs/sargam-player-windows-server.md',
]);

const destinationFor = (source) => {
  if (source === 'docs/sargam-player-windows-server.md') {
    return 'SARGAM-PLAYER-SERVER-README.md';
  }
  return source.replace(/^public\//, '');
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function buildPlayerServerBundle(root = projectRoot) {
  const output = path.join(root, PLAYER_SERVER_OUTPUT);
  await rm(output, { recursive: true, force: true });

  const manifestFiles = [];
  for (const relative of PLAYER_SERVER_FILES) {
    const source = path.join(root, relative);
    const destinationRelative = destinationFor(relative);
    const destination = path.join(output, destinationRelative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    const bytes = await readFile(destination);
    manifestFiles.push({
      path: destinationRelative.replaceAll(path.sep, '/'),
      bytes: (await stat(destination)).size,
      sha256: sha256(bytes),
    });
  }

  const packageJSON = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const manifest = {
    name: 'Sargam Player Server Bundle',
    version: packageJSON.version,
    entry: 'sargam-player/index.html',
    files: manifestFiles,
  };
  await writeFile(
    path.join(output, 'sargam-player-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  const totalBytes = manifestFiles.reduce((sum, file) => sum + file.bytes, 0);
  console.log(`Sargam Player server bundle: ${output}`);
  console.log(`${manifestFiles.length} files, ${totalBytes} bytes`);
  console.log('Entry: sargam-player/index.html');
  return { output, manifest };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await buildPlayerServerBundle();
}
