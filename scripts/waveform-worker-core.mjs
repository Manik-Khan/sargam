import path from 'node:path';

const MEDIA_EXTENSIONS = new Set([
  '.aac',
  '.aif',
  '.aiff',
  '.flac',
  '.m4a',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp3',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.ogg',
  '.opus',
  '.wav',
  '.webm',
  '.wma',
  '.wmv',
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeClassAudioSource(rawSource) {
  const source = new URL(String(rawSource || ''), 'http://sargam.local');
  let pathname;
  try {
    pathname = decodeURIComponent(source.pathname);
  } catch {
    throw new Error('The class-audio URL contains invalid escaping.');
  }
  if (!pathname.startsWith('/classaudio/')) {
    throw new Error('Only /classaudio/ recordings are enabled in this worker.');
  }
  const relative = pathname.slice('/classaudio/'.length);
  if (!relative || relative.includes('\\') || /[\0-\x1f]/.test(relative)) {
    throw new Error('The class-audio path is invalid.');
  }
  const segments = relative.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('The class-audio path is invalid.');
  }
  const extension = path.posix.extname(relative).toLowerCase();
  if (!MEDIA_EXTENSIONS.has(extension)) {
    throw new Error('This class-audio file type is not enabled for waveform generation.');
  }
  return {
    pathname: `/classaudio/${segments.map(encodeURIComponent).join('/')}`,
    relative: segments.join('/'),
  };
}

export function resolveInside(root, relativePosix) {
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, ...relativePosix.split('/'));
  const relative = path.relative(absoluteRoot, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('The resolved media path is outside the configured folder.');
  }
  return candidate;
}

export function sidecarRelativePath(relativeSource) {
  return `${relativeSource}.json`;
}

function nextPgmToken(bytes, cursor) {
  let index = cursor;
  while (index < bytes.length) {
    const value = bytes[index];
    if (value === 35) {
      while (index < bytes.length && bytes[index] !== 10 && bytes[index] !== 13) index++;
      continue;
    }
    if (value === 9 || value === 10 || value === 13 || value === 32) {
      index++;
      continue;
    }
    break;
  }
  const start = index;
  while (index < bytes.length) {
    const value = bytes[index];
    if (value === 35 || value === 9 || value === 10 || value === 13 || value === 32) break;
    index++;
  }
  if (index === start) throw new Error('The waveform image header is incomplete.');
  return {
    token: Buffer.from(bytes.subarray(start, index)).toString('ascii'),
    cursor: index,
  };
}

export function parsePgm(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let cursor = 0;
  const magic = nextPgmToken(bytes, cursor);
  cursor = magic.cursor;
  const widthToken = nextPgmToken(bytes, cursor);
  cursor = widthToken.cursor;
  const heightToken = nextPgmToken(bytes, cursor);
  cursor = heightToken.cursor;
  const maxToken = nextPgmToken(bytes, cursor);
  cursor = maxToken.cursor;

  if (magic.token !== 'P5') throw new Error('FFmpeg did not return a binary PGM waveform.');
  const width = Number(widthToken.token);
  const height = Number(heightToken.token);
  const maxValue = Number(maxToken.token);
  if (!Number.isInteger(width) || width < 2 || width > 12000 ||
      !Number.isInteger(height) || height < 8 || height > 512 ||
      !Number.isInteger(maxValue) || maxValue < 1 || maxValue > 255) {
    throw new Error('The waveform image dimensions are invalid.');
  }
  if (bytes[cursor] === 13 && bytes[cursor + 1] === 10) cursor += 2;
  else if (bytes[cursor] === 9 || bytes[cursor] === 10 || bytes[cursor] === 13 || bytes[cursor] === 32) cursor++;
  else throw new Error('The waveform image header has no pixel separator.');
  const expected = width * height;
  if (bytes.length - cursor < expected) throw new Error('The waveform image pixels are incomplete.');
  return {
    width,
    height,
    maxValue,
    pixels: bytes.subarray(cursor, cursor + expected),
  };
}

export function peaksFromPgm(pgm, thresholdRatio = 0.08) {
  const threshold = Math.max(1, Math.round(pgm.maxValue * thresholdRatio));
  const center = (pgm.height - 1) / 2;
  const denominator = Math.max(1, center);
  const peaks = new Array(pgm.width);

  for (let x = 0; x < pgm.width; x++) {
    let top = pgm.height;
    let bottom = -1;
    for (let y = 0; y < pgm.height; y++) {
      if (pgm.pixels[y * pgm.width + x] < threshold) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
    if (bottom < top) {
      peaks[x] = [0, 0];
      continue;
    }
    const minimum = clamp((center - bottom) / denominator, -1, 1);
    const maximum = clamp((center - top) / denominator, -1, 1);
    peaks[x] = [
      Math.round(minimum * 1000) / 1000,
      Math.round(maximum * 1000) / 1000,
    ];
  }
  return peaks;
}

export function sourceFingerprint(stats) {
  return {
    size: Number(stats.size),
    modified: new Date(stats.mtimeMs).toUTCString(),
  };
}

export function isSidecarCurrent(sidecar, stats) {
  if (!sidecar || sidecar.version !== 1 || !Array.isArray(sidecar.peaks)) return false;
  const fingerprint = sourceFingerprint(stats);
  return Number(sidecar.sourceSize) === fingerprint.size &&
    String(sidecar.sourceModified || '') === fingerprint.modified;
}

export function createSidecar({ sourcePathname, stats, duration, peaks }) {
  const fingerprint = sourceFingerprint(stats);
  return {
    version: 1,
    source: sourcePathname,
    sourceSize: fingerprint.size,
    sourceModified: fingerprint.modified,
    duration: Math.round(Number(duration) * 1000) / 1000,
    peaks,
  };
}

export function workerSidecarURL(sourcePathname) {
  return `/sargam-waveforms${sourcePathname}.json`;
}

export { MEDIA_EXTENSIONS };
