/* On-device audio fallback. No recording bytes are sent over the network. */
(function(root) {
  'use strict';
  const scriptURL = typeof document !== 'undefined' ? document.currentScript?.src : null;
  const LIMITS = Object.freeze({ inputBytes: 256 * 1024 * 1024, outputBytes: 128 * 1024 * 1024, seconds: 7200, timeoutMs: 180000, decodedBytes: 64 * 1024 * 1024 });
  function inspect(probe, limits = LIMITS) {
    const streams = Array.isArray(probe.streams) ? probe.streams : [];
    if (streams.some(s => s.codec_type === 'video' && !s.disposition?.attached_pic)) throw new Error('This file includes video. Automatic preparation currently supports audio recordings only.');
    const audio = streams.find(s => s.codec_type === 'audio');
    if (!audio) throw new Error('No readable audio track was found in this recording.');
    const duration = [audio.duration, probe.format?.duration].map(Number).find(value => Number.isFinite(value) && value > 0);
    const rate = Number(audio.sample_rate), channels = Number(audio.channels);
    if (!(duration > 0) || !Number.isFinite(duration)) throw new Error('The recording’s duration could not be read safely.');
    if (duration > limits.seconds) throw new Error('This recording exceeds the two-hour limit for preparation in the browser. Use a compatible copy or a browser that plays the original.');
    if (!(rate > 0 && rate <= 192000 && channels > 0 && channels <= 8)) throw new Error('This recording’s audio layout is not supported by local preparation.');
    return { duration, sampleRate: rate, channels, codec: audio.codec_name || 'unknown', decodedBytes: duration * rate * channels * 4 };
  }
  function convertArgs(input, output, limits = LIMITS) {
    return ['-nostdin', '-y', '-v', 'error', '-xerror', '-err_detect', 'explode', '-protocol_whitelist', 'file', '-i', input, '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1', '-c:a', 'flac', '-compression_level', '0', '-fs', String(limits.outputBytes), output];
  }
  function validateOutput(info, outputProbe, size, limits = LIMITS) {
    if (!(size > 0) || size >= limits.outputBytes) throw new Error('Preparing this recording would exceed the browser’s memory limit. Use a compatible copy or a browser that plays the original.');
    const output = inspect(outputProbe, limits);
    if (Math.abs(output.duration - info.duration) > Math.max(0.12, info.duration * 0.001)) throw new Error('Preparation did not produce the complete recording. The partial copy was discarded.');
    return output;
  }
  function prepare(file, { signal, onProgress = () => {}, workerFactory, timeoutMs = LIMITS.timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      if (!file || !(file.size > 0)) return reject(new Error('This recording is empty or cannot be read.'));
      if (file.size > LIMITS.inputBytes) return reject(new Error('This file exceeds the 256 MB limit for preparation in the browser. Use a compatible copy or a browser that plays the original.'));
      if (signal?.aborted) return reject(new DOMException('Preparation cancelled', 'AbortError'));
      let worker, timer, settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        worker?.terminate();
        if (error) reject(error); else resolve(result);
      };
      const cancel = () => finish(new DOMException('Preparation cancelled', 'AbortError'));
      try {
        worker = workerFactory ? workerFactory() : new Worker(new URL('audio-compat-worker.js', scriptURL));
        worker.onmessage = ({ data }) => {
          if (data?.type === 'progress') onProgress(data.progress);
          else if (data?.type === 'ready') finish(null, { blob: new Blob([data.bytes], { type: 'audio/flac' }), info: data.info });
          else if (data?.type === 'error') finish(new Error(data.message || 'This recording could not be prepared.'));
        };
        worker.onerror = () => finish(new Error('The local decoder could not start. Check your connection to load the decoder, then choose the recording again.'));
        worker.onmessageerror = () => finish(new Error('The local decoder returned an unreadable result.'));
        signal?.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(() => finish(new Error('Preparation took too long and was stopped. Use a compatible copy or a browser that plays the original.')), timeoutMs);
        // File is structured-cloned to a worker on this device, not uploaded.
        worker.postMessage({ file, limits: LIMITS });
      } catch (_) { finish(new Error('This browser cannot start the local decoder. Try a current browser.')); }
    });
  }
  root.SargamAudioCompatibility = { LIMITS, inspect, convertArgs, validateOutput, prepare };
})(globalThis);
