/* All I/O below is a virtual filesystem backed by the user's selected File. */
'use strict';
importScripts('audio-compat.js');
self.onmessage = async ({ data: { file, limits } }) => {
  try {
    importScripts('vendor/ffmpeg-0.12.10/ffmpeg-core.js');
    const core = await createFFmpegCore({
      mainScriptUrlOrBlob: self.location.href + '#' + btoa(JSON.stringify({ wasmURL: new URL('vendor/ffmpeg-0.12.10/ffmpeg-core.wasm', self.location.href).href })),
    });
    core.setLogger(() => {});
    core.setProgress(({ progress }) => self.postMessage({ type: 'progress', progress: Math.min(0.99, Math.max(0, Number(progress) || 0)) }));
    core.FS.mkdir('/local');
    // WORKERFS reads slices on demand; do not copy a whole input into WASM memory.
    core.FS.mount(core.FS.filesystems.WORKERFS, { blobs: [{ name: 'recording', data: file }] }, '/local');
    const probe = (path) => {
      core.reset();
      core.setTimeout(15000);
      const result = core.ffprobe('-v', 'error', '-protocol_whitelist', 'file', '-show_streams', '-show_format', '-of', 'json', path, '-o', '/probe.json');
      // This core leaves ret at -1 on successful ffprobe JSON output.
      // Metadata is validated below; positive return codes remain errors.
      if (result > 0) throw new Error('This recording is damaged, protected, or uses an unsupported format. It could not be prepared locally.');
      const metadata = JSON.parse(core.FS.readFile('/probe.json', { encoding: 'utf8' }));
      core.FS.unlink('/probe.json');
      return metadata;
    };
    const info = SargamAudioCompatibility.inspect(probe('/local/recording'), limits);
    core.reset();
    core.setTimeout(limits.timeoutMs);
    const result = core.exec(...SargamAudioCompatibility.convertArgs('/local/recording', '/playback.flac', limits));
    if (result !== 0) throw new Error('This recording could not be decoded completely. It may be damaged, protected, or use an unsupported format.');
    SargamAudioCompatibility.validateOutput(info, probe('/playback.flac'), core.FS.stat('/playback.flac').size, limits);
    const bytes = core.FS.readFile('/playback.flac');
    self.postMessage({ type: 'ready', bytes, info }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The local decoder could not prepare this recording.' });
  }
  // The caller terminates this worker on success, failure, timeout, or Cancel.
};
