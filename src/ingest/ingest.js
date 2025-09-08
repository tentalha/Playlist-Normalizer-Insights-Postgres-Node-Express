const fs = require('fs').promises;
const path = require('path');
const yargs = require('yargs');
const database = require('../config/database');

class PlaylistIngestor {
    constructor() {
        this.batchSize = parseInt(process.env.BATCH_SIZE) || 1000;
        this.maxRetries = parseInt(process.env.MAX_RETRIES) || 3;
        this.audioFeaturesProcessed = false;
        this.stats = {
            artists: 0,
            albums: 0,
            tracks: 0,
            playlists: 0,
            playlistTracks: 0,
            audioFeatures: 0,
            startTime: Date.now()
        };
    }

    async ingest(playlistPath, featuresPath) {
        try {
            console.log('Starting playlist ingestion...');
            await database.connect();

            // Load data files
            const data = await this.loadJsonFile(playlistPath);
            const featuresData = featuresPath ? await this.loadJsonFile(featuresPath) : null;

            // Handle both single playlist and multiple playlists structure
            const playlists = data.playlists || [data];
            console.log(`Found ${playlists.length} playlist(s) to process`);

            // Process each playlist
            for (let i = 0; i < playlists.length; i++) {
                const playlistData = playlists[i];
                console.log(`\nProcessing playlist ${i + 1}/${playlists.length}: "${playlistData.name}" (${playlistData.id})`);
                await this.processPlaylistData(playlistData, featuresData);
            }

            const duration = (Date.now() - this.stats.startTime) / 1000;
            console.log('\n=== Ingestion completed successfully! ===');
            console.log('Final Statistics:');
            console.log(`- Artists: ${this.stats.artists}`);
            console.log(`- Albums: ${this.stats.albums}`);
            console.log(`- Tracks: ${this.stats.tracks}`);
            console.log(`- Playlists: ${this.stats.playlists}`);
            console.log(`- Playlist tracks: ${this.stats.playlistTracks}`);
            console.log(`- Audio features: ${this.stats.audioFeatures}`);
            console.log(`- Duration: ${duration}s`);
            console.log('=======================================');

        } catch (error) {
            console.error('Ingestion failed:', error);
            throw error;
        } finally {
            await database.close();
        }
    }

    async loadJsonFile(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            throw new Error(`Failed to load ${filePath}: ${error.message}`);
        }
    }

    async processPlaylistData(playlistData, featuresData) {
        await database.transaction(async (client) => {
            // Extract unique entities
            const artists = new Map();
            const albums = new Map();
            const tracks = new Map();
            const audioFeaturesMap = new Map();
            const playlistTracks = [];
            const trackArtists = [];

            // Build audio features lookup (only once for all playlists)
            if (featuresData && featuresData.audio_features && !this.audioFeaturesProcessed) {
                featuresData.audio_features.forEach(feature => {
                    // Validate audio feature data
                    if (!feature.track_id) {
                        console.warn('Skipping audio feature with missing track_id:', feature);
                        return;
                    }
                    audioFeaturesMap.set(feature.track_id, feature);
                });
                this.audioFeaturesProcessed = true;
            }

            // Track duplicate detection for playlist tracks
            const seenPlaylistTracks = new Set();
            let duplicateCount = 0;
            let tracksWithoutFeatures = 0;
            // Extract data from playlist
            playlistData.tracks.forEach((item, index) => {
                const track = item.track;
                // Validate required track data
                if (!track || !track.id) {
                    console.warn(`Skipping track at position ${index} - missing track data or ID`);
                    return;
                }

                // Handle duplicate tracks in playlist
                const playlistTrackKey = `${playlistData.id}:${track.id}`;
                if (seenPlaylistTracks.has(playlistTrackKey)) {
                    duplicateCount++;
                    console.warn(`Duplicate track found in playlist: ${track.name} (${track.id}) - keeping first occurrence`);
                    return;
                }
                seenPlaylistTracks.add(playlistTrackKey);

                // Check for missing audio features
                if (!audioFeaturesMap.has(track.id)) {
                    tracksWithoutFeatures++;
                    console.warn(`Track "${track.name}" (${track.id}) has no audio features`);
                }
                
                // Collect artists with validation and track-artist relationships
                if (track.artists && Array.isArray(track.artists)) {
                    track.artists.forEach(artist => {
                        if (!artist.id || !artist.name) {
                            console.warn('Skipping artist with missing id or name:', artist);
                            return;
                        }
                        artists.set(artist.id, {
                            id: artist.id,
                            name: artist.name,
                            popularity: this.validateRange(artist.popularity, 0, 100, 'popularity'),
                            followers: artist.followers >= 0 ? artist.followers : null
                        });
                        
                        // Add track-artist relationship
                        trackArtists.push({
                            track_id: track.id,
                            artist_id: artist.id
                        });
                    });
                }

                // Collect albums with validation
                if (track.album && track.album.id) {
                    const albumType = track.album.album_type;
                    if (albumType && !['album', 'single', 'compilation'].includes(albumType)) {
                        console.warn(`Invalid album_type "${albumType}" for album ${track.album.id}, setting to null`);
                    }
                    
                    albums.set(track.album.id, {
                        id: track.album.id,
                        name: track.album.name || 'Unknown Album',
                        release_date: this.validateDate(track.album.release_date),
                        album_type: ['album', 'single', 'compilation'].includes(albumType) ? albumType : null
                    });
                }

                // Collect tracks with validation
                tracks.set(track.id, {
                    id: track.id,
                    name: track.name || 'Unknown Track',
                    duration_ms: track.duration_ms > 0 ? track.duration_ms : null,
                    explicit: Boolean(track.explicit),
                    popularity: this.validateRange(track.popularity, 0, 100, 'popularity'),
                    album_id: track.album ? track.album.id : null
                });

                // Collect playlist track relationships
                playlistTracks.push({
                    playlist_id: playlistData.id,
                    track_id: track.id,
                    added_at: item.added_at || new Date().toISOString(),
                    added_by: item.added_by || null,
                    position: typeof item.position === 'number' ? item.position : index
                });
            });

            // Log edge case statistics for this playlist
            console.log(`  Edge case stats for "${playlistData.name}":`);
            console.log(`  - Duplicate tracks removed: ${duplicateCount}`);
            console.log(`  - Tracks without audio features: ${tracksWithoutFeatures}`);
            console.log(`  - Valid tracks processed: ${tracks.size}`);

            // Upsert in batches
            await this.upsertArtists(client, Array.from(artists.values()));
            await this.upsertAlbums(client, Array.from(albums.values()));
            await this.upsertTracks(client, Array.from(tracks.values()));
            await this.upsertTrackArtists(client, trackArtists);
            await this.upsertPlaylist(client, playlistData);
            await this.upsertPlaylistTracks(client, playlistTracks);
            
            // Upsert audio features if available
            if (audioFeaturesMap.size > 0) {
                const features = Array.from(audioFeaturesMap.values())
                    .filter(f => tracks.has(f.track_id)); // Only features for valid tracks
                await this.upsertAudioFeatures(client, features);
            }
        });
    }

    async upsertArtists(client, artists) {
        console.log(`Upserting ${artists.length} artists...`);
        
        for (let i = 0; i < artists.length; i += this.batchSize) {
            const batch = artists.slice(i, i + this.batchSize);
            
            for (const artist of batch) {
                const upsert = database.buildUpsertQuery(
                    'artists',
                    artist,
                    ['id'],
                    ['name', 'popularity', 'followers']
                );
                
                await this.executeWithRetry(client, upsert.sql, upsert.params);
                this.stats.artists++;
            }
        }
    }

    async upsertAlbums(client, albums) {
        console.log(`Upserting ${albums.length} albums...`);
        
        for (let i = 0; i < albums.length; i += this.batchSize) {
            const batch = albums.slice(i, i + this.batchSize);
            
            for (const album of batch) {
                const upsert = database.buildUpsertQuery(
                    'albums',
                    album,
                    ['id'],
                    ['name', 'release_date', 'album_type']
                );
                
                await this.executeWithRetry(client, upsert.sql, upsert.params);
                this.stats.albums++;
            }
        }
    }

    async upsertTracks(client, tracks) {
        console.log(`Upserting ${tracks.length} tracks...`);
        
        for (let i = 0; i < tracks.length; i += this.batchSize) {
            const batch = tracks.slice(i, i + this.batchSize);
            
            for (const track of batch) {
                const upsert = database.buildUpsertQuery(
                    'tracks',
                    track,
                    ['id'],
                    ['name', 'duration_ms', 'explicit', 'popularity', 'album_id']
                );
                
                await this.executeWithRetry(client, upsert.sql, upsert.params);
                this.stats.tracks++;
            }
        }
    }

    async upsertTrackArtists(client, trackArtists) {
        console.log(`Upserting ${trackArtists.length} track-artist relationships...`);
        
        for (let i = 0; i < trackArtists.length; i += this.batchSize) {
            const batch = trackArtists.slice(i, i + this.batchSize);
            
            for (const trackArtist of batch) {
                const upsert = database.buildUpsertQuery(
                    'track_artists',
                    trackArtist,
                    ['track_id', 'artist_id'],
                    []
                );
                
                await this.executeWithRetry(client, upsert.sql, upsert.params);
            }
        }
    }

    async upsertPlaylist(client, playlistData) {
        console.log('Upserting playlist...');
        
        const playlist = {
            id: playlistData.id,
            name: playlistData.name,
            owner: playlistData.owner,
            snapshot: playlistData.snapshot || null
        };

        const upsert = database.buildUpsertQuery(
            'playlists',
            playlist,
            ['id'],
            ['name', 'owner', 'snapshot']
        );
        
        await this.executeWithRetry(client, upsert.sql, upsert.params);
        this.stats.playlists++;
    }

    async upsertPlaylistTracks(client, playlistTracks) {
        console.log(`Upserting ${playlistTracks.length} playlist tracks...`);
        
        for (let i = 0; i < playlistTracks.length; i += this.batchSize) {
            const batch = playlistTracks.slice(i, i + this.batchSize);
            
            for (const playlistTrack of batch) {
                const upsert = database.buildUpsertQuery(
                    'playlist_tracks',
                    playlistTrack,
                    ['playlist_id', 'track_id'],
                    ['added_at', 'added_by', 'position']
                );
                
                await this.executeWithRetry(client, upsert.sql, upsert.params);
                this.stats.playlistTracks++;
            }
        }
    }

    async upsertAudioFeatures(client, features) {
        console.log(`Upserting ${features.length} audio features...`);
        
        for (let i = 0; i < features.length; i += this.batchSize) {
            const batch = features.slice(i, i + this.batchSize);
            
            for (const feature of batch) {
                const upsert = database.buildUpsertQuery(
                    'audio_features',
                    feature,
                    ['track_id'],
                    ['danceability', 'energy', 'tempo', 'key', 'mode', 'valence']
                );
                
                await this.executeWithRetry(client, upsert.sql, upsert.params);
                this.stats.audioFeatures++;
            }
        }
    }

    //Recurssive function to execute queries with retry
    async executeWithRetry(client, sql, params, retries = 0) {
        try {
            return await client.query(sql, params);
        } catch (error) {
            if (retries < this.maxRetries) {
                console.warn(`Query failed, retrying (${retries + 1}/${this.maxRetries}):`, error.message);
                //On each retry add a second to the wait time.
                await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1)));
                return this.executeWithRetry(client, sql, params, retries + 1);
            }
            throw error;
        }
    }

    // Helper method to validate numeric ranges
    validateRange(value, min, max, fieldName) {
        if (value === null || value === undefined) return null;
        const num = Number(value);
        if (isNaN(num) || num < min || num > max) {
            console.warn(`Invalid ${fieldName} value: ${value}, setting to null`);
            return null;
        }
        return num;
    }

    // Helper method to validate dates
    validateDate(dateString) {
        if (!dateString) return null;
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            console.warn(`Invalid date: ${dateString}, setting to null`);
            return null;
        }
        return dateString;
    }
}

// Main execution
async function main() {
    // CLI setup
    const argv = yargs
        .option('from', {
            alias: 'f',
            description: 'Path to playlist JSON file',
            type: 'string',
            demandOption: true
        })
        .option('features', {
            alias: 'af',
            description: 'Path to audio features JSON file',
            type: 'string'
        })
        .help()
        .alias('help', 'h')
        .argv;

    try {
        const ingestor = new PlaylistIngestor();
        await ingestor.ingest(argv.from, argv.features);
        process.exit(0);
    } catch (error) {
        console.error('Ingestion failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = PlaylistIngestor;
