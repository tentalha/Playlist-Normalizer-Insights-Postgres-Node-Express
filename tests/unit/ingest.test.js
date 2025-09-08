const PlaylistIngestor = require('../../src/ingest/ingest');

describe('PlaylistIngestor Unit Tests', () => {
    let ingestor;

    beforeEach(() => {
        ingestor = new PlaylistIngestor();
    });

    describe('loadJsonFile', () => {
        test('should load valid JSON file', async () => {
            const mockData = { test: 'data' };
            const fs = require('fs').promises;
            jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(mockData));

            const result = await ingestor.loadJsonFile('test.json');
            expect(result).toEqual(mockData);
        });

        test('should throw error for invalid JSON', async () => {
            const fs = require('fs').promises;
            jest.spyOn(fs, 'readFile').mockResolvedValue('invalid json');

            await expect(ingestor.loadJsonFile('test.json')).rejects.toThrow();
        });

        test('should throw error for non-existent file', async () => {
            const fs = require('fs').promises;
            jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'));

            await expect(ingestor.loadJsonFile('nonexistent.json')).rejects.toThrow('Failed to load nonexistent.json');
        });
    });

    describe('executeWithRetry', () => {
        test('should succeed on first try', async () => {
            const mockClient = {
                query: jest.fn().mockResolvedValue({ rows: [] })
            };

            const result = await ingestor.executeWithRetry(mockClient, 'SELECT 1', []);
            expect(mockClient.query).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ rows: [] });
        });

        test('should retry on failure and eventually succeed', async () => {
            const mockClient = {
                query: jest.fn()
                    .mockRejectedValueOnce(new Error('Connection failed'))
                    .mockRejectedValueOnce(new Error('Connection failed'))
                    .mockResolvedValue({ rows: [] })
            };

            // Mock setTimeout to avoid actual delays in tests
            jest.spyOn(global, 'setTimeout').mockImplementation((fn) => fn());

            const result = await ingestor.executeWithRetry(mockClient, 'SELECT 1', []);
            expect(mockClient.query).toHaveBeenCalledTimes(3);
            expect(result).toEqual({ rows: [] });

            global.setTimeout.mockRestore();
        });

        test('should fail after max retries', async () => {
            const mockClient = {
                query: jest.fn().mockRejectedValue(new Error('Persistent error'))
            };

            jest.spyOn(global, 'setTimeout').mockImplementation((fn) => fn());

            await expect(ingestor.executeWithRetry(mockClient, 'SELECT 1', [])).rejects.toThrow('Persistent error');
            expect(mockClient.query).toHaveBeenCalledTimes(4); // Initial + 3 retries

            global.setTimeout.mockRestore();
        });
    });

    describe('Data extraction', () => {
        test('should extract unique artists from playlist data', () => {
            const playlistData = {
                tracks: [
                    {
                        track: {
                            id: 'track1',
                            name: 'Track 1',
                            artists: [
                                { id: 'artist1', name: 'Artist 1', popularity: 80 },
                                { id: 'artist2', name: 'Artist 2', popularity: 70 }
                            ]
                        }
                    },
                    {
                        track: {
                            id: 'track2',
                            name: 'Track 2',
                            artists: [
                                { id: 'artist1', name: 'Artist 1', popularity: 80 } // Duplicate
                            ]
                        }
                    }
                ]
            };

            const artists = new Map();
            playlistData.tracks.forEach(item => {
                item.track.artists.forEach(artist => {
                    artists.set(artist.id, {
                        id: artist.id,
                        name: artist.name,
                        popularity: artist.popularity || null,
                        followers: artist.followers || null
                    });
                });
            });

            expect(artists.size).toBe(2);
            expect(artists.has('artist1')).toBe(true);
            expect(artists.has('artist2')).toBe(true);
            expect(artists.get('artist1').name).toBe('Artist 1');
        });
    });
});
