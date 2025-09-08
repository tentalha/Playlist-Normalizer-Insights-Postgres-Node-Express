-- ClickHouse Schema for Playlist Track Events
-- This table stores events for playlist track additions/removals for OLAP analysis

CREATE TABLE playlist_track_events
(
    playlist_id String,
    track_id    String,
    artist_id   String,
    added_at    DateTime,
    action      Enum8('add' = 1, 'remove' = 2),
    popularity  UInt16,
    energy      Float32
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(added_at)
ORDER BY (playlist_id, track_id, added_at);
