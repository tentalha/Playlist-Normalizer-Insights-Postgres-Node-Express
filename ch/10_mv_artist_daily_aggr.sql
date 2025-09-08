-- Materialized View for Daily Artist Track Aggregations
-- Creates a daily aggregate of unique tracks added per artist using AggregatingMergeTree

-- First, create the target table for the materialized view
CREATE TABLE artist_daily_stats
(
    date Date,
    artist_id String,
    unique_tracks_added AggregateFunction(uniq, String),
    total_adds UInt64,
    avg_popularity AggregateFunction(avg, UInt16),
    avg_energy AggregateFunction(avg, Float32)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, artist_id);

-- Create the materialized view
CREATE MATERIALIZED VIEW mv_artist_daily_aggr TO artist_daily_stats AS
SELECT
    toDate(added_at) as date,
    artist_id,
    uniqState(track_id) as unique_tracks_added,
    count() as total_adds,
    avgState(popularity) as avg_popularity,
    avgState(energy) as avg_energy
FROM playlist_track_events
WHERE action = 'add'
GROUP BY date, artist_id;
