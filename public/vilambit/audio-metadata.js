/* Bounded local header reads for optional full-waveform decoding. Unknown or
 * oversized layouts stay streamed; no recording is uploaded or fully read. */
(function(root) {
  const MAX_HEADER = 2 * 1024 * 1024;
  const text = (v, at, n) => String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset + at, n));
  const valid = info => info && info.sampleRate > 0 && info.sampleRate <= 192000 && info.channels > 0 && info.channels <= 8 ? info : null;
  async function inspect(file) {
    if (!file?.slice) return null;
    const read = async (at, length) => new DataView(await file.slice(at, at + Math.min(length, MAX_HEADER)).arrayBuffer());
    const head = await read(0, 65536);
    if (head.byteLength < 16) return null;
    const magic = text(head, 0, 4);
    if (magic === 'RIFF' && text(head, 8, 4) === 'WAVE') {
      let fmt = null, dataBytes = null;
      for (let at = 12, count = 0; at + 8 <= file.size && count++ < 1000;) {
        const chunk = await read(at, 48);
        if (chunk.byteLength < 8) break;
        const size = chunk.getUint32(4, true), id = text(chunk, 0, 4);
        if (id === 'fmt ' && chunk.byteLength >= 24) {
          const encoding = chunk.getUint16(8, true);
          if (![1, 3, 65534].includes(encoding)) return null;
          fmt = { channels: chunk.getUint16(10, true), sampleRate: chunk.getUint32(12, true), bytesPerSecond: chunk.getUint32(16, true) };
        }
        if (id === 'data') dataBytes = size;
        at += 8 + size + (size % 2);
        if (fmt && dataBytes !== null) return valid({ ...fmt, duration: dataBytes / fmt.bytesPerSecond });
      }
    }
    if (magic === 'fLaC' && head.byteLength >= 42 && (head.getUint8(4) & 127) === 0) {
      const high = head.getUint32(18), low = head.getUint32(22);
      const sampleRate = high >>> 12;
      return valid({ sampleRate, channels: ((high >>> 9) & 7) + 1, duration: ((high & 15) * 4294967296 + low) / sampleRate });
    }
    if (magic === 'FORM' && ['AIFF', 'AIFC'].includes(text(head, 8, 4))) {
      for (let at = 12; at + 26 <= head.byteLength;) {
        const size = head.getUint32(at + 4);
        if (text(head, at, 4) === 'COMM') {
          const exponent = head.getUint16(at + 16) & 32767;
          const mantissa = head.getUint32(at + 18) * 4294967296 + head.getUint32(at + 22);
          const sampleRate = mantissa * 2 ** (exponent - 16383 - 63);
          return valid({ channels: head.getUint16(at + 8), sampleRate, duration: head.getUint32(at + 10) / sampleRate });
        }
        at += 8 + size + (size % 2);
      }
    }
    if (/\.(mp3|mp2)$/i.test(file.name || '') || file.type === 'audio/mpeg') {
      let at = 0;
      if (text(head, 0, 3) === 'ID3') at = 10 + [6,7,8,9].reduce((n,i) => n * 128 + (head.getUint8(i) & 127), 0) + ((head.getUint8(5) & 16) ? 10 : 0);
      const frame = at + 4 <= head.byteLength ? new DataView(head.buffer, at, head.byteLength - at) : await read(at, 4);
      if (frame.byteLength >= 4) {
        const bits = frame.getUint32(0), version = (bits >>> 19) & 3, rateIndex = (bits >>> 10) & 3;
        if ((bits >>> 21) === 2047 && version !== 1 && ((bits >>> 17) & 3) && rateIndex < 3) {
          return valid({ channels: ((bits >>> 6) & 3) === 3 ? 1 : 2, sampleRate: [44100,48000,32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4) });
        }
      }
    }
    if (magic === 'OggS' && head.byteLength > 28) {
      const packet = 27 + head.getUint8(26);
      if (packet + 19 <= head.byteLength) {
        if (text(head, packet, 8) === 'OpusHead') return valid({ sampleRate: 48000, channels: head.getUint8(packet + 9) });
        if (head.getUint8(packet) === 1 && text(head, packet + 1, 6) === 'vorbis') return valid({ sampleRate: head.getUint32(packet + 12, true), channels: head.getUint8(packet + 11) });
      }
    }
    if (text(head, 4, 4) === 'ftyp') {
      let moov = null;
      for (let at = 0, count = 0; at + 8 <= file.size && count++ < 1000;) {
        const box = await read(at, 16);
        if (box.byteLength < 8) break;
        let size = box.getUint32(0), header = 8;
        if (size === 1 && box.byteLength >= 16) { size = box.getUint32(8) * 4294967296 + box.getUint32(12); header = 16; }
        if (size < header || !Number.isSafeInteger(size) || at + size > file.size) break;
        if (text(box, 4, 4) === 'moov') { if (size > MAX_HEADER) return null; moov = await read(at + header, size - header); break; }
        at += size;
      }
      if (!moov) return null;
      const children = (start, end) => {
        const boxes = [];
        for (let at = start; at + 8 <= end;) {
          const size = moov.getUint32(at);
          if (size < 8 || at + size > end) break;
          boxes.push({ type: text(moov, at + 4, 4), start: at + 8, end: at + size }); at += size;
        }
        return boxes;
      };
      for (const track of children(0, moov.byteLength).filter(b => b.type === 'trak')) {
        const mdia = children(track.start, track.end).find(b => b.type === 'mdia');
        if (!mdia) continue;
        const media = children(mdia.start, mdia.end), hdlr = media.find(b => b.type === 'hdlr');
        if (!hdlr || hdlr.end - hdlr.start < 12 || text(moov, hdlr.start + 8, 4) !== 'soun') continue;
        const mdhd = media.find(b => b.type === 'mdhd'), minf = media.find(b => b.type === 'minf');
        if (!mdhd || !minf) continue;
        const stbl = children(minf.start, minf.end).find(b => b.type === 'stbl');
        const stsd = stbl && children(stbl.start, stbl.end).find(b => b.type === 'stsd');
        if (!stsd || stsd.end - stsd.start < 44 || moov.getUint32(stsd.start + 4) !== 1) return null;
        const entry = stsd.start + 8;
        if (moov.getUint16(entry + 16) !== 0) return null;
        const version = moov.getUint8(mdhd.start), offset = mdhd.start + (version === 1 ? 20 : 12);
        if (offset + (version === 1 ? 12 : 8) > mdhd.end) return null;
        const scale = moov.getUint32(offset);
        const duration = version === 1 ? moov.getUint32(offset + 4) * 4294967296 + moov.getUint32(offset + 8) : moov.getUint32(offset + 4);
        return valid({ channels: moov.getUint16(entry + 24), sampleRate: moov.getUint32(entry + 32) / 65536, duration: duration / scale });
      }
    }
    return null;
  }
  const fits = (info, duration = info?.duration, rate = 48000, limit = 64 * 1024 * 1024) => Boolean(valid(info) && duration > 0 && Number.isFinite(duration) && duration * Math.max(rate, info.sampleRate) * info.channels * 4 <= limit);
  root.SargamAudioMetadata = { inspect: file => inspect(file).catch(() => null), fits };
})(globalThis);
