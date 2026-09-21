# Audio compatibility fixtures

Generated locally, no user or archive recordings. Each is a two-second 440 Hz
sine wave at 44.1 kHz stereo, created with FFmpeg:

```
ffmpeg -f lavfi -i sine=frequency=440:duration=2 -ar 44100 -ac 2 -c:a alac codec-alac.m4a
ffmpeg -f lavfi -i sine=frequency=440:duration=2 -ar 44100 -ac 2 -c:a aac codec-aac.m4a
```

The ALAC fixture's decoded signed-16-bit little-endian PCM MD5 is
`60d54244523167ac82014d660adce3aa`. The real decoder regression checks the
lossless FLAC STREAMINFO MD5 against this value. Tests use the checked-in
fixtures; FFmpeg does not need to be installed to run the suite.
