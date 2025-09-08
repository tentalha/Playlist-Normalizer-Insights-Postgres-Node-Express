# Playlist Normalizer & Insights

A comprehensive ETL pipeline and API system for playlist data normalization and analytics. Built with Node.js and PostgreSQL, featuring robust data ingestion, RESTful APIs, and comprehensive testing.

## Quick Start

### 1. Setup Database

Initialize the PostgreSQL database with normalized schema:

```bash
npm run setup-db
```

This command will:
- Create the database if it doesn't exist
- Drop existing tables and recreate with fresh schema
- Apply all indexes and constraints
- Prepare the database for data ingestion

### 2. Install Dependencies

```bash
npm install
```

### 3. Ingest Data

Load playlist and audio features data into the normalized database:

```bash
npm run ingest -- --from fixtures/playlist.basic.json --features fixtures/audio_features.json
```

This processes multiple playlists with:
- Duplicate track detection and removal
- Data validation and edge case handling
- Track-artist relationship mapping
- Idempotent operations with retry logic

### 4. Start Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```


## API Endpoints

### GET /playlists/:id/tracks

Retrieve tracks from a playlist with optional energy filtering.

**Parameters:**
- `energyMin` (optional): Minimum energy level (0.0-1.0)

**Example:**
```bash
curl "http://localhost:3000/playlists/37i9dQZF1DXcBWIGoYBM5M/tracks?energyMin=0.7"
```

**Response:**
```json
{
  "playlist_id": "37i9dQZF1DXcBWIGoYBM5M",
  "energy_filter": 0.7,
  "track_count": 15,
  "tracks": [
    {
      "track_id": "4iV5W9uYEdYUVa79Axb7Rh",
      "track_name": "Flowers",
      "duration_ms": 200454,
      "explicit": false,
      "track_popularity": 95,
      "added_at": "2023-01-13T00:00:00.000Z",
      "added_by": "spotify",
      "position": 0,
      "energy": 0.9,
      "danceability": 0.8,
      "valence": 0.7,
      "tempo": 128.0,
      "key": 1,
      "mode": 1,
      "album": {
        "id": "1zJZPTeOj1nI8OR2OIVVKm",
        "name": "Endless Summer Vacation",
        "release_date": "2023-03-10",
        "album_type": "album"
      },
      "artists": [
        {
          "id": "5YGY8feqx7naU7z4HrwZM6",
          "name": "Miley Cyrus",
          "popularity": 85,
          "followers": 45123456
        }
      ]
    }
  ]
}
```

### GET /artists/:id/summary

Get comprehensive artist information with top tracks and audio feature averages.

**Example:**
```bash
curl "http://localhost:3000/artists/5YGY8feqx7naU7z4HrwZM6/summary"
```

**Response:**
```json
{
  "artist": {
    "id": "5YGY8feqx7naU7z4HrwZM6",
    "name": "Miley Cyrus",
    "popularity": 85,
    "followers": 45123456
  },
  "top_tracks": [
    {
      "track_id": "4iV5W9uYEdYUVa79Axb7Rh",
      "track_name": "Flowers",
      "popularity": 95,
      "energy": 0.9
    }
  ],
  "average_audio_features": {
    "energy": 0.85,
    "danceability": 0.75,
    "valence": 0.68,
    "tempo": 125.5
  },
  "summary": {
    "total_tracks": 3,
    "avg_popularity": 88.5,
    "most_common_key": 1,
    "most_common_mode": 1
  }
}
```

## Database Design & Indexing

### Indexes Strategy

Optimized indexes for high-performance queries:

```sql
-- Primary performance indexes
CREATE INDEX idx_tracks_popularity ON tracks(popularity DESC);
CREATE INDEX idx_audio_features_energy ON audio_features(energy DESC);
CREATE INDEX idx_artists_popularity ON artists(popularity DESC);

-- Junction table indexes for fast joins
CREATE INDEX idx_track_artists_track_id ON track_artists(track_id);
CREATE INDEX idx_track_artists_artist_id ON track_artists(artist_id);
CREATE INDEX idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);
CREATE INDEX idx_playlist_tracks_track_id ON playlist_tracks(track_id);

-- Composite index for playlist ordering
CREATE INDEX idx_playlist_tracks_position ON playlist_tracks(playlist_id, position);
```

**Why these indexes:**
- **Energy/Popularity DESC**: Enables fast filtering and ordering by these common query patterns
- **Junction table indexes**: Critical for many-to-many relationship joins between tracks-artists and playlist-tracks
- **Composite position index**: Optimizes playlist track ordering queries

### Key Queries Explained

**1. Energy-filtered playlist tracks with artists:**
```sql
SELECT t.*, jsonb_agg(DISTINCT ar.*) as artists
FROM playlist_tracks pt
JOIN tracks t ON pt.track_id = t.id
LEFT JOIN track_artists ta ON t.id = ta.track_id
LEFT JOIN artists ar ON ta.artist_id = ar.id
WHERE pt.playlist_id = $1 AND af.energy >= $2
GROUP BY t.id
ORDER BY af.energy DESC;
```
- Uses `idx_playlist_tracks_playlist_id` for playlist filtering
- Uses `idx_audio_features_energy` for energy filtering and ordering
- `jsonb_agg()` aggregates multiple artists per track efficiently

**2. Artist summary with aggregated features:**
```sql
SELECT ar.*, AVG(af.energy) as avg_energy, COUNT(t.id) as track_count
FROM artists ar
JOIN track_artists ta ON ar.id = ta.artist_id
JOIN tracks t ON ta.track_id = t.id
LEFT JOIN audio_features af ON t.id = af.track_id
WHERE ar.id = $1
GROUP BY ar.id;
```
- Uses `idx_track_artists_artist_id` for fast artist-to-tracks lookup
- Aggregates audio features across all artist's tracks

## ClickHouse Analytics (ch/)

The `ch/` directory contains OLAP queries for advanced analytics:

### Files Overview:
- **`00_schema.sql`**: ClickHouse table definitions optimized for analytical queries
- **`10_mv_artist_daily_aggr.sql`**: Materialized view for daily artist aggregations
- **`20_queries.sql`**: Complex analytical queries for insights

### Key Analytics Queries:

**Daily Artist Performance:**
```sql
SELECT 
    artist_name,
    toDate(added_at) as date,
    count() as tracks_added,
    avg(energy) as avg_energy,
    avg(popularity) as avg_popularity
FROM playlist_tracks_flat
GROUP BY artist_name, toDate(added_at)
ORDER BY date DESC, tracks_added DESC;
```

**Energy Distribution Analysis:**
```sql
SELECT 
    multiIf(
        energy >= 0.8, 'High Energy',
        energy >= 0.5, 'Medium Energy',
        'Low Energy'
    ) as energy_category,
    count() as track_count,
    avg(popularity) as avg_popularity
FROM audio_features_flat
GROUP BY energy_category;
```

ClickHouse provides:
- **Columnar storage** for fast analytical queries
- **Materialized views** for pre-aggregated metrics
- **Real-time analytics** on playlist and track performance

## Test Suites

Comprehensive testing with Jest:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Test Coverage:

**Unit Tests (`tests/unit/`):**
- Data validation and edge case handling
- Duplicate track detection
- Audio feature processing
- Error handling and retry logic

**Integration Tests (`tests/integration/`):**
- API endpoint functionality
- Database operations and transactions
- End-to-end playlist ingestion
- Idempotent re-ingestion verification

**Edge Cases Covered:**
- Missing audio features
- Duplicate tracks in playlists
- Invalid data formats
- Database connection failures
- Malformed JSON input

## Project Structure

```
src/
├── api/
│   ├── routes.js      # HTTP route definitions (ultra-clean)
│   ├── controller.js  # Request/response handling & validation
│   ├── service.js     # Business logic & database operations
│   └── server.js      # Express server setup
├── config/
│   ├── database.js    # Database connection & abstraction
│   └── setup-db.js    # Database initialization script
└── ingest/
    └── ingest.js      # ETL pipeline and data processing

tests/
├── integration/
│   └── api.test.js    # End-to-end API tests
├── unit/
│   └── ingest.test.js # Unit tests for ingestion logic
└── setup.js           # Test environment setup

ch/                    # ClickHouse OLAP analytics
├── 00_schema.sql      # ClickHouse table definitions
├── 10_mv_artist_daily_aggr.sql  # Materialized views
└── 20_queries.sql     # Analytical queries

db/
└── postgres/
    └── schema.sql     # PostgreSQL schema with indexes

fixtures/              # Sample data files
├── playlist.basic.json
└── audio_features.json

.env                   # Environment configuration
package.json          # Dependencies and scripts
README.md            # This file
```

### Database Schema

**Normalized relational structure:**
```
artists (id, name, popularity, followers)
├── track_artists (track_id, artist_id)  # Many-to-many junction
└── tracks (id, name, duration_ms, explicit, popularity, album_id)
    ├── audio_features (track_id, danceability, energy, tempo, ...)
    └── playlist_tracks (playlist_id, track_id, added_at, added_by, position)
        └── playlists (id, name, owner, snapshot)
```

**Key Design Principles:**
- **Normalized schema** eliminates data redundancy
- **Junction tables** handle many-to-many relationships
- **Referential integrity** with foreign key constraints
- **Performance indexes** on frequently queried columns

### API Architecture

**3-Layer Architecture:**
```
Routes (HTTP) → Controllers (Request/Response) → Services (Business Logic) → Database
```

**Layer Responsibilities:**
- **Routes**: Pure URL-to-controller mapping (1 line per endpoint)
- **Controllers**: HTTP concerns, validation, error formatting, response handling
- **Services**: Business logic, database operations, data processing
- **Database**: Data persistence and retrieval

**Benefits:**
- **Separation of concerns** with clear boundaries
- **Testability** - services can be unit tested independently
- **Maintainability** - each layer has single responsibility
- **Dependency injection** for loose coupling

## Author

Waseem Khan
