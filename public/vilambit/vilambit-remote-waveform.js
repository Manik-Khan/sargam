(function attachSargamRemoteWaveform(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SargamRemoteWaveform = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRemoteWaveform() {
  'use strict';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function ascii(view, offset, length) {
    let value = '';
    for (let i = 0; i < length; i++) value += String.fromCharCode(view.getUint8(offset + i));
    return value;
  }

  function parseContentRangeTotal(value) {
    const match = String(value || '').match(/\/(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function parseWavHeader(arrayBuffer, totalBytes = null) {
    const view = new DataView(arrayBuffer);
    if (view.byteLength < 44 || ascii(view, 0, 4) !== 'RIFF' || ascii(view, 8, 4) !== 'WAVE') {
      throw new Error('This recording is not a supported RIFF/WAVE file.');
    }

    let format = null;
    let data = null;
    let offset = 12;
    while (offset + 8 <= view.byteLength) {
      const id = ascii(view, offset, 4);
      const declaredSize = view.getUint32(offset + 4, true);
      const body = offset + 8;

      if (id === 'fmt ' && body + Math.min(declaredSize, 16) <= view.byteLength && declaredSize >= 16) {
        let audioFormat = view.getUint16(body, true);
        if (audioFormat === 0xfffe && declaredSize >= 26 && body + 26 <= view.byteLength) {
          audioFormat = view.getUint16(body + 24, true);
        }
        format = {
          audioFormat,
          channels: view.getUint16(body + 2, true),
          sampleRate: view.getUint32(body + 4, true),
          byteRate: view.getUint32(body + 8, true),
          blockAlign: view.getUint16(body + 12, true),
          bitsPerSample: view.getUint16(body + 14, true),
        };
      } else if (id === 'data') {
        const available = Number.isFinite(totalBytes) ? Math.max(0, totalBytes - body) : declaredSize;
        data = {
          dataOffset: body,
          dataSize: declaredSize === 0xffffffff ? available : Math.min(declaredSize, available),
        };
      }

      if (format && data) break;
      const next = body + declaredSize + (declaredSize % 2);
      if (next <= offset || next > view.byteLength) break;
      offset = next;
    }

    if (!format || !data) throw new Error('The WAV header does not expose a readable audio data chunk.');
    if (![1, 3].includes(format.audioFormat)) throw new Error('Only PCM and IEEE-float WAV files can be sampled remotely.');
    if (!format.channels || !format.sampleRate || !format.blockAlign || !format.bitsPerSample) {
      throw new Error('The WAV format information is incomplete.');
    }

    const bytesPerSample = format.bitsPerSample / 8;
    if (![1, 2, 3, 4, 8].includes(bytesPerSample) || bytesPerSample * format.channels > format.blockAlign) {
      throw new Error('The WAV sample layout is unsupported.');
    }

    return {
      ...format,
      ...data,
      bytesPerSample,
      duration: format.byteRate > 0 ? data.dataSize / format.byteRate : 0,
    };
  }

  function sampleValue(view, offset, format, bits) {
    if (format === 3) {
      if (bits === 32) return clamp(view.getFloat32(offset, true), -1, 1);
      if (bits === 64) return clamp(view.getFloat64(offset, true), -1, 1);
      return 0;
    }
    if (bits === 8) return (view.getUint8(offset) - 128) / 128;
    if (bits === 16) return view.getInt16(offset, true) / 32768;
    if (bits === 24) {
      let value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
      if (value & 0x800000) value |= 0xff000000;
      return value / 8388608;
    }
    if (bits === 32) return view.getInt32(offset, true) / 2147483648;
    return 0;
  }

  function peakFromPCMRange(arrayBuffer, wav) {
    const view = new DataView(arrayBuffer);
    const frames = Math.floor(view.byteLength / wav.blockAlign);
    if (!frames) return [0, 0];
    const stride = Math.max(1, Math.floor(frames / 4096));
    let min = 1;
    let max = -1;
    for (let frame = 0; frame < frames; frame += stride) {
      const base = frame * wav.blockAlign;
      let mixed = 0;
      for (let channel = 0; channel < wav.channels; channel++) {
        mixed += sampleValue(
          view,
          base + channel * wav.bytesPerSample,
          wav.audioFormat,
          wav.bitsPerSample,
        );
      }
      mixed /= wav.channels;
      if (mixed < min) min = mixed;
      if (mixed > max) max = mixed;
    }
    return min <= max ? [clamp(min, -1, 1), clamp(max, -1, 1)] : [0, 0];
  }

  function normalizePeaks(peaks, maxColumns = 12000) {
    if (!Array.isArray(peaks) || peaks.length < 2 || peaks.length > maxColumns) {
      throw new Error('The waveform peak file is invalid.');
    }
    return peaks.map((peak) => {
      if (!Array.isArray(peak) || peak.length < 2) return [0, 0];
      const a = clamp(Number(peak[0]) || 0, -1, 1);
      const b = clamp(Number(peak[1]) || 0, -1, 1);
      return a <= b ? [a, b] : [b, a];
    });
  }

  function interpolateSparsePeaks(samples, columns = 1600) {
    const count = Math.max(2, Math.floor(columns));
    const points = (Array.isArray(samples) ? samples : [])
      .filter((sample) => sample && Number.isFinite(sample.position) && Array.isArray(sample.peak))
      .map((sample) => ({
        position: clamp(sample.position, 0, 1),
        peak: normalizePeaks([sample.peak, sample.peak])[0],
      }))
      .sort((a, b) => a.position - b.position);
    if (!points.length) return new Array(count).fill(null);

    const peaks = new Array(count);
    let right = 0;
    for (let column = 0; column < count; column++) {
      const position = count === 1 ? 0 : column / (count - 1);
      while (right < points.length - 1 && points[right].position < position) right++;
      const next = points[right];
      const previous = points[Math.max(0, right - 1)];
      const span = next.position - previous.position;
      const mix = span > 0 ? clamp((position - previous.position) / span, 0, 1) : 0;
      peaks[column] = [
        previous.peak[0] + (next.peak[0] - previous.peak[0]) * mix,
        previous.peak[1] + (next.peak[1] - previous.peak[1]) * mix,
      ];
    }
    return peaks;
  }

  function sidecarURLForSource(sourceURL) {
    const source = new URL(sourceURL);
    const relativePath = source.pathname.replace(/^\/+/, '');
    return new URL(`/sargam-waveforms/${relativePath}.json`, source.origin).href;
  }

  function classAudioPathForSource(sourceURL) {
    const source = new URL(sourceURL);
    return source.pathname.startsWith('/classaudio/') ? source.pathname : null;
  }

  function workerURLForSource(sourceURL, port = 8091) {
    const source = new URL(sourceURL);
    const sourcePath = classAudioPathForSource(sourceURL);
    if (!sourcePath) return null;
    const worker = new URL(source.origin);
    worker.port = String(port);
    worker.pathname = '/v1/waveform';
    worker.search = '';
    worker.searchParams.set('src', sourcePath);
    return worker.href;
  }

  function normalizeSidecar(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('The waveform response is invalid.');
    return {
      version: Number(payload.version) || 0,
      source: typeof payload.source === 'string' ? payload.source : '',
      sourceSize: Number(payload.sourceSize) || 0,
      sourceModified: typeof payload.sourceModified === 'string' ? payload.sourceModified : '',
      duration: Number(payload.duration) || 0,
      peaks: normalizePeaks(payload.peaks),
    };
  }

  async function cancelBody(response) {
    try {
      if (response && response.body && typeof response.body.cancel === 'function') {
        await response.body.cancel();
      }
    } catch (_) {
      // Cancellation is a memory-safety optimization; a failed cancel is harmless.
    }
  }

  async function fetchRange(fetchImpl, url, start, end) {
    const response = await fetchImpl(url, {
      headers: { Range: `bytes=${start}-${end}` },
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (response.status !== 206) {
      await cancelBody(response);
      throw new Error('The archive server did not honor byte-range waveform requests.');
    }
    return response;
  }

  async function fetchApproximateWavPeaks(sourceURL, options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error('This browser cannot request a streamed waveform.');

    const headerBytes = Math.max(65536, Number(options.headerBytes) || 262144);
    const headerResponse = await fetchRange(fetchImpl, sourceURL, 0, headerBytes - 1);
    const totalBytes = parseContentRangeTotal(headerResponse.headers && headerResponse.headers.get('Content-Range'));
    const headerBuffer = await headerResponse.arrayBuffer();
    const wav = parseWavHeader(headerBuffer, totalBytes);

    const sampleCount = clamp(Math.floor(Number(options.sampleCount) || 64), 16, 128);
    const columns = clamp(Math.floor(Number(options.columns) || 1600), 200, 5000);
    const concurrency = clamp(Math.floor(Number(options.concurrency) || 4), 1, 8);
    const requestedChunkBytes = Math.max(wav.blockAlign, Number(options.chunkBytes) || 65536);
    const chunkBytes = Math.max(
      wav.blockAlign,
      Math.min(wav.dataSize, Math.floor(requestedChunkBytes / wav.blockAlign) * wav.blockAlign),
    );

    const jobs = new Array(sampleCount).fill(null).map((_, index) => {
      const position = sampleCount === 1 ? 0 : index / (sampleCount - 1);
      const maxOffset = Math.max(0, wav.dataSize - chunkBytes);
      const relative = Math.floor((position * maxOffset) / wav.blockAlign) * wav.blockAlign;
      const start = wav.dataOffset + relative;
      return {
        position,
        start,
        end: Math.min(wav.dataOffset + wav.dataSize - 1, start + chunkBytes - 1),
      };
    });

    const samples = new Array(jobs.length);
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length) {
        const index = cursor++;
        const job = jobs[index];
        const response = await fetchRange(fetchImpl, sourceURL, job.start, job.end);
        samples[index] = {
          position: job.position,
          peak: peakFromPCMRange(await response.arrayBuffer(), wav),
        };
      }
    }
    await Promise.all(new Array(Math.min(concurrency, jobs.length)).fill(null).map(worker));

    return {
      duration: wav.duration,
      peaks: interpolateSparsePeaks(samples, columns),
      sampledRanges: sampleCount,
    };
  }

  return {
    parseContentRangeTotal,
    parseWavHeader,
    peakFromPCMRange,
    normalizePeaks,
    normalizeSidecar,
    interpolateSparsePeaks,
    sidecarURLForSource,
    classAudioPathForSource,
    workerURLForSource,
    fetchApproximateWavPeaks,
  };
});
