-- ClickHouse Analytical Queries
-- These queries demonstrate OLAP thinking with ClickHouse-specific functions

-- Query A: Top artists in the last 30 days by unique track adds with tie-breaker on average popularity
SELECT 
    artist_id,
    uniqExact(track_id) as unique_tracks_added,
    avg(popularity) as avg_popularity,
    count() as total_adds
FROM playlist_track_events
WHERE action = 'add' 
    AND added_at >= now() - INTERVAL 30 DAY
GROUP BY artist_id
ORDER BY unique_tracks_added DESC, avg_popularity DESC
LIMIT 20;

-- Query B: Energy distribution per playlist using quantiles and topK artists
SELECT 
    playlist_id,
    count() as total_tracks,
    quantiles(0.25, 0.5, 0.9)(energy) as energy_quantiles,
    avg(energy) as avg_energy,
    topK(5)(artist_id) as top_artists_by_frequency,
    uniqExact(artist_id) as unique_artists
FROM playlist_track_events
WHERE action = 'add' 
    AND energy > 0
GROUP BY playlist_id
ORDER BY total_tracks DESC
LIMIT 50;

-- Query C: Window function - Top 5 artists per day by unique adds
SELECT 
    date,
    artist_id,
    unique_tracks_added,
    daily_rank
FROM (
    SELECT 
        toDate(added_at) as date,
        artist_id,
        uniqExact(track_id) as unique_tracks_added,
        row_number() OVER (
            PARTITION BY toDate(added_at) 
            ORDER BY uniqExact(track_id) DESC, avg(popularity) DESC
        ) as daily_rank
    FROM playlist_track_events
    WHERE action = 'add'
        AND added_at >= now() - INTERVAL 7 DAY
    GROUP BY date, artist_id
) ranked
WHERE daily_rank <= 5
ORDER BY date DESC, daily_rank ASC;

-- Bonus Query: Advanced analytics with multiple window functions
-- Shows artist performance trends with moving averages and ranking changes
SELECT 
    date,
    artist_id,
    unique_tracks_added,
    daily_rank,
    lag(daily_rank, 1) OVER (PARTITION BY artist_id ORDER BY date) as prev_rank,
    daily_rank - lag(daily_rank, 1) OVER (PARTITION BY artist_id ORDER BY date) as rank_change,
    avg(unique_tracks_added) OVER (
        PARTITION BY artist_id 
        ORDER BY date 
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) as moving_avg_3day
FROM (
    SELECT 
        toDate(added_at) as date,
        artist_id,
        uniqExact(track_id) as unique_tracks_added,
        row_number() OVER (
            PARTITION BY toDate(added_at) 
            ORDER BY uniqExact(track_id) DESC
        ) as daily_rank
    FROM playlist_track_events
    WHERE action = 'add'
        AND added_at >= now() - INTERVAL 14 DAY
    GROUP BY date, artist_id
) ranked
WHERE daily_rank <= 10
ORDER BY date DESC, daily_rank ASC;

-- Query for using the materialized view
-- Retrieve aggregated data from the materialized view with proper merge functions
SELECT 
    date,
    artist_id,
    uniqMerge(unique_tracks_added) as unique_tracks,
    total_adds,
    avgMerge(avg_popularity) as avg_popularity,
    avgMerge(avg_energy) as avg_energy
FROM artist_daily_stats
WHERE date >= today() - 30
GROUP BY date, artist_id, total_adds
ORDER BY date DESC, unique_tracks DESC
LIMIT 100;
