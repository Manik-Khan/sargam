// Remote archive waveform math and range-loading checks.
import assert from 'node:assert/strict';

await import('../public/vilambit/vilambit-remote-waveform.js');
const Waveform = globalThis.SargamRemoteWaveform;

function writeASCII(view, offset, value) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function makePCM16Wav({ sampleRate = 8000, seconds = 1 } = {}) {
  const frames = Math.floor(sampleRate * seconds);
  const dataBytes = frames * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeASCII(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeASCII(view, 8, 'WAVE');
  writeASCII(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeASCII(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let frame = 0; frame < frames; frame++) {
    const amplitude = frame < frames / 2 ? 0.2 : 0.8;
    view.setInt16(44 + frame * 2, Math.round(Math.sin(frame / 7) * amplitude * 32767), true);
  }
  return buffer;
}

export const smokes = [
  {
    name: 'remote waveform: PCM WAV headers and peaks are decoded without a full AudioBuffer',
    fn() {
      assert.ok(Waveform);
      const wavBytes = makePCM16Wav();
      const header = Waveform.parseWavHeader(wavBytes, wavBytes.byteLength);
      assert.equal(header.audioFormat, 1);
      assert.equal(header.channels, 1);
      assert.equal(header.sampleRate, 8000);
      assert.equal(header.dataOffset, 44);
      assert.equal(header.duration, 1);
      const peak = Waveform.peakFromPCMRange(wavBytes.slice(44), header);
      assert.ok(peak[0] < -0.7);
      assert.ok(peak[1] > 0.7);
    },
  },
  {
    name: 'remote waveform: sidecars live outside the media directory and sparse samples fill the view',
    fn() {
      assert.equal(
        Waveform.sidecarURLForSource('http://10.0.0.2/classaudio/A%20B.wav'),
        'http://10.0.0.2/sargam-waveforms/classaudio/A%20B.wav.json',
      );
      const peaks = Waveform.interpolateSparsePeaks([
        { position: 0, peak: [-0.2, 0.2] },
        { position: 1, peak: [-0.8, 0.8] },
      ], 5);
      assert.equal(peaks.length, 5);
      assert.deepEqual(peaks[0], [-0.2, 0.2]);
      assert.deepEqual(peaks[4], [-0.8, 0.8]);
      assert.ok(Math.abs(peaks[2][1] - 0.5) < 1e-9);
    },
  },
  {
    name: 'remote waveform: class audio derives a separate host-worker request without changing FileMaker URLs',
    fn() {
      assert.equal(
        Waveform.classAudioPathForSource('http://10.0.0.2/classaudio/A%20B.mp4'),
        '/classaudio/A%20B.mp4',
      );
      assert.equal(
        Waveform.workerURLForSource('http://10.0.0.2/classaudio/A%20B.mp4'),
        'http://10.0.0.2:8091/v1/waveform?src=%2Fclassaudio%2FA%2520B.mp4',
      );
      assert.equal(
        Waveform.workerURLForSource('http://10.0.0.2/concertvideo/A.mp4'),
        null,
      );
    },
  },
  {
    name: 'remote waveform: archive overview uses only HTTP byte-range responses',
    async fn() {
      const wavBytes = makePCM16Wav({ seconds: 2 });
      const bytes = new Uint8Array(wavBytes);
      const ranges = [];
      const fetchImpl = async (_url, options) => {
        const match = String(options.headers.Range).match(/^bytes=(\d+)-(\d+)$/);
        assert.ok(match);
        const start = Number(match[1]);
        const requestedEnd = Number(match[2]);
        const end = Math.min(bytes.length - 1, requestedEnd);
        ranges.push([start, end]);
        return new Response(bytes.slice(start, end + 1), {
          status: 206,
          headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` },
        });
      };
      const result = await Waveform.fetchApproximateWavPeaks('http://10.0.0.2/classaudio/test.wav', {
        fetchImpl,
        headerBytes: 65536,
        sampleCount: 16,
        chunkBytes: 1024,
        columns: 200,
        concurrency: 2,
      });
      assert.equal(result.duration, 2);
      assert.equal(result.peaks.length, 200);
      assert.equal(result.sampledRanges, 16);
      assert.equal(ranges.length, 17);
      assert.ok(ranges.every(([start, end]) => start >= 0 && end < bytes.length));
      assert.ok(result.peaks.some((peak) => peak[1] > 0.5));
    },
  },
];
