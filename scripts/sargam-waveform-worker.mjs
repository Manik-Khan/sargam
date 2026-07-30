import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createSidecar,
  isSidecarCurrent,
  normalizeClassAudioSource,
  parsePgm,
  peaksFromPgm,
  resolveInside,
  sidecarRelativePath,
  workerSidecarURL,
} from './waveform-worker-core.mjs';

const workerDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultConfigPath = path.join(workerDirectory, 'sargam-waveform-worker.config.json');
const jobs = new Map();
const failures = new Map();
const pending = [];
let activeJobs = 0;

const json = (response, status, payload, origin = null) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
  response.end(`${JSON.stringify(payload)}\n`);
};

const readJSON = async (file) => JSON.parse(await readFile(file, 'utf8'));

async function readConfig(configPath = defaultConfigPath) {
  const config = await readJSON(configPath);
  const required = ['classAudioRoot', 'waveformRoot', 'ffmpegPath', 'ffprobePath'];
  for (const key of required) {
    if (!config[key] || typeof config[key] !== 'string') {
      throw new Error(`Missing ${key} in ${configPath}`);
    }
  }
  return {
    host: config.host || '0.0.0.0',
    port: Math.max(1, Math.min(65535, Number(config.port) || 8091)),
    classAudioRoot: path.resolve(config.classAudioRoot),
    waveformRoot: path.resolve(config.waveformRoot),
    ffmpegPath: path.resolve(config.ffmpegPath),
    ffprobePath: path.resolve(config.ffprobePath),
    allowedOrigins: Array.isArray(config.allowedOrigins) ? config.allowedOrigins : [],
    columns: Math.max(400, Math.min(5000, Number(config.columns) || 1600)),
    height: Math.max(32, Math.min(256, Number(config.height) || 96)),
    maxConcurrentJobs: Math.max(1, Math.min(4, Number(config.maxConcurrentJobs) || 1)),
    jobTimeoutMinutes: Math.max(2, Math.min(120, Number(config.jobTimeoutMinutes) || 30)),
  };
}

function collectProcess(command, args, { maxStdoutBytes, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      if (!settled) reject(new Error('Waveform generation timed out.'));
      settled = true;
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxStdoutBytes) {
        child.kill();
        if (!settled) reject(new Error('FFmpeg returned too much waveform data.'));
        settled = true;
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (stderrBytes < 65536) stderr.push(chunk.subarray(0, 65536 - stderrBytes));
      stderrBytes += chunk.length;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      if (!settled) reject(error);
      settled = true;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const errorText = Buffer.concat(stderr).toString('utf8').trim();
      if (code !== 0) {
        reject(new Error(errorText || `${path.basename(command)} exited with code ${code}.`));
        return;
      }
      resolve({
        stdout: Buffer.concat(stdout),
        stderr: errorText,
      });
    });
  });
}

async function probeDuration(config, sourceFile) {
  const result = await collectProcess(config.ffprobePath, [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=duration:format=duration',
    '-of', 'json',
    sourceFile,
  ], {
    maxStdoutBytes: 1024 * 1024,
    timeoutMs: config.jobTimeoutMinutes * 60_000,
  });
  const payload = JSON.parse(result.stdout.toString('utf8'));
  const duration = Number(payload.streams && payload.streams[0] && payload.streams[0].duration) ||
    Number(payload.format && payload.format.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('FFprobe could not determine the recording duration.');
  }
  return duration;
}

async function renderPgm(config, sourceFile) {
  const result = await collectProcess(config.ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', sourceFile,
    '-filter_complex',
    `aformat=channel_layouts=mono,showwavespic=s=${config.columns}x${config.height}:colors=white:scale=sqrt`,
    '-frames:v', '1',
    '-c:v', 'pgm',
    '-f', 'image2pipe',
    'pipe:1',
  ], {
    maxStdoutBytes: config.columns * config.height + 1024 * 1024,
    timeoutMs: config.jobTimeoutMinutes * 60_000,
  });
  return result.stdout;
}

async function existingSidecar(outputFile, sourceStats) {
  try {
    const payload = await readJSON(outputFile);
    return isSidecarCurrent(payload, sourceStats) ? payload : null;
  } catch {
    return null;
  }
}

export async function generateWaveform(config, normalizedSource) {
  const sourceFile = resolveInside(config.classAudioRoot, normalizedSource.relative);
  const outputFile = resolveInside(config.waveformRoot, sidecarRelativePath(normalizedSource.relative));
  const sourceStats = await stat(sourceFile);
  if (!sourceStats.isFile()) throw new Error('The class-audio source is not a file.');

  const current = await existingSidecar(outputFile, sourceStats);
  if (current) return { outputFile, waveform: current, reused: true };

  const [duration, pgmBytes] = await Promise.all([
    probeDuration(config, sourceFile),
    renderPgm(config, sourceFile),
  ]);
  const waveform = createSidecar({
    sourcePathname: normalizedSource.pathname,
    stats: sourceStats,
    duration,
    peaks: peaksFromPgm(parsePgm(pgmBytes)),
  });
  await mkdir(path.dirname(outputFile), { recursive: true });
  const temporary = `${outputFile}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(waveform)}\n`, 'utf8');
  await rm(outputFile, { force: true });
  await rename(temporary, outputFile);
  return { outputFile, waveform, reused: false };
}

function beginNext(config) {
  while (activeJobs < config.maxConcurrentJobs && pending.length) {
    const task = pending.shift();
    activeJobs++;
    generateWaveform(config, task.source)
      .then((result) => {
        console.log(`${result.reused ? 'Reused' : 'Created'} ${result.outputFile}`);
        task.resolve(result);
      })
      .catch((error) => {
        failures.set(task.key, {
          message: error.message || String(error),
          expires: Date.now() + 5 * 60_000,
        });
        console.error(`Waveform failed for ${task.source.pathname}: ${error.message || error}`);
        task.reject(error);
      })
      .finally(() => {
        activeJobs--;
        jobs.delete(task.key);
        beginNext(config);
      });
  }
}

function queueWaveform(config, source) {
  const key = source.relative.toLowerCase();
  if (jobs.has(key)) return jobs.get(key);
  const promise = new Promise((resolve, reject) => {
    pending.push({ key, source, resolve, reject });
  });
  promise.catch(() => {});
  jobs.set(key, promise);
  beginNext(config);
  return promise;
}

async function readyWaveform(config, source) {
  const sourceFile = resolveInside(config.classAudioRoot, source.relative);
  const outputFile = resolveInside(config.waveformRoot, sidecarRelativePath(source.relative));
  const sourceStats = await stat(sourceFile);
  if (!sourceStats.isFile()) throw new Error('The class-audio source is not a file.');
  const waveform = await existingSidecar(outputFile, sourceStats);
  return waveform ? { outputFile, waveform } : null;
}

function allowedOrigin(config, request) {
  const origin = String(request.headers.origin || '');
  if (!origin) return null;
  if (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin)) return origin;
  return false;
}

export async function startWaveformWorker(configPath = process.env.SARGAM_WAVEFORM_CONFIG || defaultConfigPath) {
  const config = await readConfig(configPath);
  await Promise.all([
    access(config.classAudioRoot),
    mkdir(config.waveformRoot, { recursive: true }),
    access(config.ffmpegPath),
    access(config.ffprobePath),
  ]);

  const server = createServer(async (request, response) => {
    const corsOrigin = allowedOrigin(config, request);
    if (corsOrigin === false) {
      json(response, 403, { status: 'error', message: 'This browser origin is not allowed.' });
      return;
    }
    const requestURL = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (request.method !== 'GET') {
      json(response, 405, { status: 'error', message: 'Only GET requests are supported.' }, corsOrigin);
      return;
    }
    if (requestURL.pathname === '/health') {
      json(response, 200, {
        status: 'ok',
        activeJobs,
        queuedJobs: pending.length,
        scope: '/classaudio/',
      }, corsOrigin);
      return;
    }
    if (requestURL.pathname !== '/v1/waveform') {
      json(response, 404, { status: 'error', message: 'Unknown waveform-worker route.' }, corsOrigin);
      return;
    }

    let source;
    try {
      source = normalizeClassAudioSource(requestURL.searchParams.get('src'));
      const ready = await readyWaveform(config, source);
      if (ready) {
        json(response, 200, {
          status: 'ready',
          sidecarURL: workerSidecarURL(source.pathname),
          waveform: ready.waveform,
        }, corsOrigin);
        return;
      }
    } catch (error) {
      const missing = error && error.code === 'ENOENT';
      json(response, missing ? 404 : 400, {
        status: 'error',
        message: missing ? 'The class-audio recording was not found.' : (error.message || String(error)),
      }, corsOrigin);
      return;
    }

    const key = source.relative.toLowerCase();
    const failure = failures.get(key);
    if (failure && failure.expires > Date.now()) {
      json(response, 500, { status: 'error', message: failure.message }, corsOrigin);
      return;
    }
    failures.delete(key);
    queueWaveform(config, source);
    json(response, 202, {
      status: 'building',
      message: 'The host is preparing this waveform.',
    }, corsOrigin);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });
  console.log(`Sargam Waveform Worker listening on http://${config.host}:${config.port}`);
  console.log(`Class audio: ${config.classAudioRoot}`);
  console.log(`Waveforms: ${config.waveformRoot}`);
  return { server, config };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await startWaveformWorker();
}
