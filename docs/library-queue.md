# Library and Queue contract

Library, Queue, Linked phrases, and Playlist are intentionally different models.

- **Library** is the durable catalog of recordings available from the project or archive.
- **Queue** is the transient order for the current listening session.
- **Linked phrases** are composition-specific notation-to-audio A–B links.
- **Playlist** is a durable named collection and is not part of this wave.

## Session state

The pure queue controller in `src/engine/session-queue.js` owns:

```text
current item
ordered upcoming items
ordered history
repeat mode: off | track | queue
```

Each occurrence receives an internal `queueId`. Its `libraryId` remains the stable catalog identity. Adding an item never changes or pauses the current recording.

Supported transitions:

- add upcoming;
- reorder upcoming;
- remove upcoming;
- clear upcoming;
- play a Library item now;
- next and previous;
- repeat current track after natural completion;
- repeat the accepted queue order;
- block automatic advance while an A–B loop is active.

Pressing **Next** is explicit: it clears an active A–B loop and advances. Turning the loop off restores ordinary end-of-track advancement.

## Library records

The initial catalog adapter reads project `media.json` sources. A record requires:

```text
id        stable archive/project identity
name      display name
kind      audio | video
duration  positive seconds when known
url       optional same-origin HTTP(S) media URL
eqProfilesUrl  optional same-origin profile manifest
```

Filename alone never creates identity. Cross-origin URLs, filesystem paths, and unsupported protocols never become playable Library records.

A currently loaded local file may appear in Library, but it is not reopenable or queueable after the browser loses its file permission. The interface therefore asks for reconnection rather than binding another file with the same name.

## Player bridge

`load-library-source` is the only new parent-to-player command. It carries a stable ID, controlled same-origin URL, display name, and optional EQ manifest URL. The player repeats the same-origin check before loading and publishes the stable ID back in its state snapshot.

Per-source workspace restoration still runs through `workspace.json` only after the returned source identity matches.

## Next adapter wave

The FileMaker/archive adapter remains pending. It should translate authoritative records into the Library shape above without exposing raw network filesystem paths. Named playlists follow only after the transient Queue interaction is accepted in the real archive environment.
