-- PostgreSQL Schema for Playlist Normalizer
-- Drop tables if they exist (for development)
DROP TABLE IF EXISTS playlist_tracks CASCADE;
DROP TABLE IF EXISTS audio_features CASCADE;
DROP TABLE IF EXISTS tracks CASCADE;
DROP TABLE IF EXISTS albums CASCADE;
DROP TABLE IF EXISTS artists CASCADE;
DROP TABLE IF EXISTS playlists CASCADE;
DROP TABLE IF EXISTS track_artists CASCADE;

-- Artists table
CREATE TABLE artists (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    popularity INTEGER CHECK (popularity >= 0 AND popularity <= 100),
    followers INTEGER CHECK (followers >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Albums table
CREATE TABLE albums (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    release_date DATE,
    album_type VARCHAR(50) CHECK (album_type IN ('album', 'single', 'compilation')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tracks table
CREATE TABLE tracks (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
    explicit BOOLEAN DEFAULT FALSE,
    popularity INTEGER CHECK (popularity >= 0 AND popularity <= 100),
    album_id VARCHAR(255) REFERENCES albums(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Playlists table
CREATE TABLE playlists (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    owner VARCHAR(255) NOT NULL,
    snapshot VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track artists junction table
CREATE TABLE track_artists (
    track_id VARCHAR(255) REFERENCES tracks(id) ON DELETE CASCADE,
    artist_id VARCHAR(255) REFERENCES artists(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (track_id, artist_id)
);

-- Playlist tracks junction table
CREATE TABLE playlist_tracks (
    playlist_id VARCHAR(255) REFERENCES playlists(id) ON DELETE CASCADE,
    track_id VARCHAR(255) REFERENCES tracks(id) ON DELETE CASCADE,
    added_at TIMESTAMP NOT NULL,
    added_by VARCHAR(255),
    position INTEGER NOT NULL CHECK (position >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, track_id, position),
    UNIQUE (playlist_id, track_id)
);

-- Audio features table
CREATE TABLE audio_features (
    track_id VARCHAR(255) PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
    danceability DECIMAL(4,3) CHECK (danceability >= 0 AND danceability <= 1),
    energy DECIMAL(4,3) CHECK (energy >= 0 AND energy <= 1),
    tempo DECIMAL(7,3) CHECK (tempo >= 0),
    key INTEGER CHECK (key >= -1 AND key <= 11),
    mode INTEGER CHECK (mode IN (0, 1)),
    valence DECIMAL(4,3) CHECK (valence >= 0 AND valence <= 1),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_tracks_album_id ON tracks(album_id);
CREATE INDEX idx_tracks_popularity ON tracks(popularity DESC);
CREATE INDEX idx_track_artists_track_id ON track_artists(track_id);
CREATE INDEX idx_track_artists_artist_id ON track_artists(artist_id);
CREATE INDEX idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);
CREATE INDEX idx_playlist_tracks_track_id ON playlist_tracks(track_id);
CREATE INDEX idx_playlist_tracks_position ON playlist_tracks(playlist_id, position);
CREATE INDEX idx_audio_features_energy ON audio_features(energy DESC);
CREATE INDEX idx_artists_popularity ON artists(popularity DESC);

-- Create update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_artists_updated_at BEFORE UPDATE ON artists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_albums_updated_at BEFORE UPDATE ON albums
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tracks_updated_at BEFORE UPDATE ON tracks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_playlists_updated_at BEFORE UPDATE ON playlists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_audio_features_updated_at BEFORE UPDATE ON audio_features
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
