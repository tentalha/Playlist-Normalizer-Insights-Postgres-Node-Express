const request = require('supertest');
const database = require('../../src/config/database');
const PlaylistIngestor = require('../../src/ingest/ingest');

// Import app but don't start the server
const app = require('../../src/api/server');

describe('API Integration Tests', () => {
    let testPlaylistId;
    let testArtistId;

    beforeAll(async () => {
        // Connect to test database
        await database.connect();
        
        // Clean up any existing test data
        await cleanupTestData();
        
        // Ingest test fixture data
        const ingestor = new PlaylistIngestor();
        const playlistData = {
            id: 'test_playlist_123',
            name: 'Test Playlist',
            owner: 'test_user',
            snapshot: 'test_snapshot',
            tracks: [
                {
                    track: {
                        id: 'test_track_1',
                        name: 'High Energy Track',
                        duration_ms: 180000,
                        explicit: false,
                        popularity: 85,
                        album: {
                            id: 'test_album_1',
                            name: 'Test Album',
                            release_date: '2023-01-01',
                            album_type: 'album'
                        },
                        artists: [
                            {
                                id: 'test_artist_1',
                                name: 'Test Artist',
                                popularity: 90,
                                followers: 1000000
                            }
                        ]
                    },
                    added_at: '2023-01-01T00:00:00Z',
                    added_by: 'test_user',
                    position: 0
                },
                {
                    track: {
                        id: 'test_track_2',
                        name: 'Low Energy Track',
                        duration_ms: 200000,
                        explicit: false,
                        popularity: 75,
                        album: {
                            id: 'test_album_1',
                            name: 'Test Album',
                            release_date: '2023-01-01',
                            album_type: 'album'
                        },
                        artists: [
                            {
                                id: 'test_artist_1',
                                name: 'Test Artist',
                                popularity: 90,
                                followers: 1000000
                            }
                        ]
                    },
                    added_at: '2023-01-02T00:00:00Z',
                    added_by: 'test_user',
                    position: 1
                }
            ]
        };

        const featuresData = {
            audio_features: [
                {
                    track_id: 'test_track_1',
                    danceability: 0.8,
                    energy: 0.9,
                    tempo: 128.0,
                    key: 1,
                    mode: 1,
                    valence: 0.7
                },
                {
                    track_id: 'test_track_2',
                    danceability: 0.4,
                    energy: 0.3,
                    tempo: 90.0,
                    key: 5,
                    mode: 0,
                    valence: 0.2
                }
            ]
        };

        // Process test data
        await ingestor.processPlaylistData(playlistData, featuresData);
        
        testPlaylistId = 'test_playlist_123';
        testArtistId = 'test_artist_1';
    });

    afterAll(async () => {
        await cleanupTestData();
        await database.close();
    });

    async function cleanupTestData() {
        try {
            // Clean up in reverse order of dependencies
            await database.query('DELETE FROM playlist_tracks WHERE playlist_id LIKE $1', ['test_%']);
            await database.query('DELETE FROM track_artists WHERE track_id LIKE $1', ['test_%']);
            await database.query('DELETE FROM audio_features WHERE track_id LIKE $1', ['test_%']);
            await database.query('DELETE FROM tracks WHERE id LIKE $1', ['test_%']);
            await database.query('DELETE FROM albums WHERE id LIKE $1', ['test_%']);
            await database.query('DELETE FROM artists WHERE id LIKE $1', ['test_%']);
            await database.query('DELETE FROM playlists WHERE id LIKE $1', ['test_%']);
        } catch (error) {
            console.warn('Cleanup warning:', error.message);
        }
    }

    describe('GET /playlists/:id/tracks', () => {
        test('should return tracks with energy filter', async () => {
            const response = await request(app)
                .get(`/playlists/${testPlaylistId}/tracks?energyMin=0.7`)
                .expect(200);

            expect(response.body).toHaveProperty('playlist_id', testPlaylistId);
            expect(response.body).toHaveProperty('energy_filter', 0.7);
            expect(response.body).toHaveProperty('tracks');
            expect(Array.isArray(response.body.tracks)).toBe(true);
            
            // Should only return high energy track (energy >= 0.7)
            expect(response.body.track_count).toBe(1);
            expect(response.body.tracks[0]).toHaveProperty('track_name', 'High Energy Track');
            expect(response.body.tracks[0]).toHaveProperty('energy', 0.9);
        });

        test('should return all tracks with low energy filter', async () => {
            const response = await request(app)
                .get(`/playlists/${testPlaylistId}/tracks?energyMin=0.1`)
                .expect(200);

            expect(response.body.track_count).toBe(2);
        });

        test('should return tracks ordered by energy DESC', async () => {
            const response = await request(app)
                .get(`/playlists/${testPlaylistId}/tracks?energyMin=0`)
                .expect(200);

            expect(response.body.tracks.length).toBe(2);
            // First track should have higher energy
            expect(response.body.tracks[0].energy).toBeGreaterThan(response.body.tracks[1].energy);
        });

        test('should return 400 for invalid energy parameter', async () => {
            await request(app)
                .get(`/playlists/${testPlaylistId}/tracks?energyMin=1.5`)
                .expect(400);

            await request(app)
                .get(`/playlists/${testPlaylistId}/tracks?energyMin=-0.1`)
                .expect(400);
        });

        test('should return 404 for non-existent playlist', async () => {
            const response = await request(app)
                .get('/playlists/non_existent/tracks')
                .expect(404);

            expect(response.body).toHaveProperty('error', 'Playlist not found');
            expect(response.body).toHaveProperty('playlist_id', 'non_existent');
        });
    });

    describe('GET /artists/:id/summary', () => {
        test('should return artist summary with top tracks', async () => {
            const response = await request(app)
                .get(`/artists/${testArtistId}/summary`)
                .expect(200);

            expect(response.body).toHaveProperty('artist');
            expect(response.body.artist).toHaveProperty('id', testArtistId);
            expect(response.body.artist).toHaveProperty('name', 'Test Artist');
            expect(response.body.artist).toHaveProperty('popularity', 90);

            expect(response.body).toHaveProperty('top_tracks');
            expect(Array.isArray(response.body.top_tracks)).toBe(true);

            expect(response.body).toHaveProperty('average_audio_features');
            expect(response.body).toHaveProperty('summary');
        });

        test('should return 404 for non-existent artist', async () => {
            await request(app)
                .get('/artists/non_existent_artist/summary')
                .expect(404);
        });
    });

    describe('Idempotent ingestion', () => {
        test('should not duplicate data on re-ingestion', async () => {
            // Get initial counts
            const playlistCountSql = 'SELECT COUNT(*) as count FROM playlists WHERE id = $1';
            const trackCountSql = 'SELECT COUNT(*) as count FROM tracks WHERE id LIKE $1';
                
            const initialPlaylistCount = await database.query(playlistCountSql, [testPlaylistId]);
            const initialTrackCount = await database.query(trackCountSql, ['test_%']);

            // Re-ingest the same data
            const ingestor = new PlaylistIngestor();
            const playlistData = {
                id: testPlaylistId,
                name: 'Test Playlist Updated',
                owner: 'test_user',
                snapshot: 'test_snapshot_updated',
                tracks: [
                    {
                        track: {
                            id: 'test_track_1',
                            name: 'High Energy Track',
                            duration_ms: 180000,
                            explicit: false,
                            popularity: 85,
                            album: {
                                id: 'test_album_1',
                                name: 'Test Album',
                                release_date: '2023-01-01',
                                album_type: 'album'
                            },
                            artists: [
                                {
                                    id: 'test_artist_1',
                                    name: 'Test Artist',
                                    popularity: 90,
                                    followers: 1000000
                                }
                            ]
                        },
                        added_at: '2023-01-01T00:00:00Z',
                        added_by: 'test_user',
                        position: 0
                    }
                ]
            };

            await ingestor.processPlaylistData(playlistData, null);

            // Check counts haven't increased
            const finalPlaylistCount = await database.query(playlistCountSql, [testPlaylistId]);
            const finalTrackCount = await database.query(trackCountSql, ['test_%']);

            expect(finalPlaylistCount[0].count).toBe(initialPlaylistCount[0].count);
            expect(finalTrackCount[0].count).toBe(initialTrackCount[0].count);

            // But data should be updated
            const playlistNameSql = 'SELECT name FROM playlists WHERE id = $1';
            const updatedPlaylist = await database.query(playlistNameSql, [testPlaylistId]);
            expect(updatedPlaylist[0].name).toBe('Test Playlist Updated');
        });
    });

    describe('Health check', () => {
        test('should return API information', async () => {
            const response = await request(app)
                .get('/')
                .expect(200);

            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('endpoints');
            expect(Array.isArray(response.body.endpoints)).toBe(true);
        });
    });

    describe('404 handling', () => {
        test('should return 404 for unknown endpoints', async () => {
            const response = await request(app)
                .get('/unknown/endpoint')
                .expect(404);

            expect(response.body).toHaveProperty('error', 'Endpoint not found');
        });
    });
});
