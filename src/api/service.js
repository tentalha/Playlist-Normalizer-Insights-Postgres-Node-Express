const database = require('../config/database');

class PlaylistService {
    
    async getPlaylistTracksData(playlistId, energyMin = 0) {
        // Validate playlist ID
        if (!playlistId || playlistId.trim() === '') {
            throw new Error('Playlist ID is required and cannot be empty');
        }

        // Validate energy parameter
        if (isNaN(energyMin) || energyMin < 0 || energyMin > 1) {
            throw new Error('energyMin must be a number between 0 and 1');
        }

        // Check if playlist exists first
        const playlistCheck = 'SELECT id FROM playlists WHERE id = $1';
        const playlistExists = await database.query(playlistCheck, [playlistId]);
        
        if (playlistExists.length === 0) {
            const error = new Error('Playlist not found');
            error.status = 404;
            error.playlist_id = playlistId;
            throw error;
        }

        // Raw SQL query with joins and filtering
        const simplifiedSql = `
            SELECT 
                t.id as track_id,
                t.name as track_name,
                t.duration_ms,
                t.explicit,
                t.popularity as track_popularity,
                pt.added_at,
                pt.added_by,
                pt.position,
                COALESCE(af.energy, 0) as energy,
                af.danceability,
                af.valence,
                af.tempo,
                af.key,
                af.mode,
                CASE 
                    WHEN a.id IS NOT NULL THEN
                        jsonb_build_object(
                            'id', a.id,
                            'name', a.name,
                            'release_date', a.release_date,
                            'album_type', a.album_type
                        )
                    ELSE NULL
                END as album,
                COALESCE(
                    jsonb_agg(
                        DISTINCT jsonb_build_object(
                            'id', ar.id,
                            'name', ar.name,
                            'popularity', ar.popularity,
                            'followers', ar.followers
                        )
                    ) FILTER (WHERE ar.id IS NOT NULL),
                    '[]'::jsonb
                ) as artists
            FROM playlist_tracks pt
            JOIN tracks t ON pt.track_id = t.id
            LEFT JOIN albums a ON t.album_id = a.id
            LEFT JOIN audio_features af ON t.id = af.track_id
            LEFT JOIN track_artists ta ON t.id = ta.track_id
            LEFT JOIN artists ar ON ta.artist_id = ar.id
            WHERE pt.playlist_id = $1 
                AND (af.energy IS NULL OR af.energy >= $2)
            GROUP BY t.id, t.name, t.duration_ms, t.explicit, t.popularity, 
                     pt.added_at, pt.added_by, pt.position, af.energy, 
                     af.danceability, af.valence, af.tempo, af.key, af.mode,
                     a.id, a.name, a.release_date, a.album_type
            ORDER BY COALESCE(af.energy, 0) DESC, t.popularity DESC NULLS LAST
        `;

        const tracks = await database.query(simplifiedSql, [playlistId, energyMin]);

        // Handle empty results
        if (tracks.length === 0) {
            return {
                playlist_id: playlistId,
                energy_filter: energyMin,
                track_count: 0,
                tracks: [],
                message: energyMin > 0 ? 
                    `No tracks found with energy >= ${energyMin}` : 
                    'No tracks found in this playlist'
            };
        }

        // Convert numeric fields and parse artists JSON
        const processedTracks = tracks.map(track => ({
            ...track,
            artists: Array.isArray(track.artists) ? track.artists : [],
            // Convert string numbers to actual numbers
            energy: parseFloat(track.energy) || 0,
            danceability: track.danceability ? parseFloat(track.danceability) : null,
            valence: track.valence ? parseFloat(track.valence) : null,
            tempo: track.tempo ? parseFloat(track.tempo) : null,
            key: track.key !== null ? parseInt(track.key) : null,
            mode: track.mode !== null ? parseInt(track.mode) : null
        }));

        return {
            playlist_id: playlistId,
            energy_filter: energyMin,
            track_count: processedTracks.length,
            tracks: processedTracks
        };
    }
}

class ArtistService {
    
    async getArtistSummaryData(artistId) {
        // Validate artist ID
        if (!artistId || artistId.trim() === '') {
            throw new Error('Artist ID is required and cannot be empty');
        }

        // Get artist basic info
        const artistQuery = 'SELECT * FROM artists WHERE id = $1';
        const artists = await database.query(artistQuery, [artistId]);
        
        if (artists.length === 0) {
            const error = new Error('Artist not found');
            error.status = 404;
            error.artist_id = artistId;
            throw error;
        }

        const artist = artists[0];

        // Get top tracks with better error handling
        const topTracksSql = `
            WITH artist_tracks AS (
                SELECT DISTINCT
                    t.id,
                    t.name,
                    COALESCE(t.popularity, 0) as popularity,
                    t.duration_ms,
                    t.explicit,
                    af.danceability,
                    af.energy,
                    af.valence,
                    af.tempo,
                    af.key,
                    af.mode,
                    COALESCE(a.name, 'Unknown Album') as album_name,
                    ROW_NUMBER() OVER (ORDER BY COALESCE(t.popularity, 0) DESC) as rank
                FROM tracks t
                LEFT JOIN albums a ON t.album_id = a.id  
                LEFT JOIN audio_features af ON t.id = af.track_id
                WHERE EXISTS (
                    SELECT 1 FROM playlist_tracks pt WHERE pt.track_id = t.id
                )
                AND t.popularity IS NOT NULL
            ),
            top_tracks AS (
                SELECT * FROM artist_tracks WHERE rank <= 5
            ),
            avg_features AS (
                SELECT 
                    ROUND(AVG(danceability)::numeric, 3) as avg_danceability,
                    ROUND(AVG(energy)::numeric, 3) as avg_energy,
                    ROUND(AVG(valence)::numeric, 3) as avg_valence,
                    ROUND(AVG(tempo)::numeric, 3) as avg_tempo,
                    ROUND(AVG(key)::numeric, 1) as avg_key,
                    ROUND(AVG(mode)::numeric, 1) as avg_mode
                FROM top_tracks
                WHERE danceability IS NOT NULL
            )
            SELECT 
                json_build_object(
                    'tracks', COALESCE(json_agg(
                        json_build_object(
                            'id', tt.id,
                            'name', tt.name,
                            'popularity', tt.popularity,
                            'duration_ms', tt.duration_ms,
                            'explicit', tt.explicit,
                            'album_name', tt.album_name
                        ) ORDER BY tt.popularity DESC
                    ) FILTER (WHERE tt.id IS NOT NULL), '[]'::json),
                    'average_audio_features', COALESCE((
                        SELECT json_build_object(
                            'danceability', avg_danceability,
                            'energy', avg_energy,
                            'valence', avg_valence,
                            'tempo', avg_tempo,
                            'key', avg_key,
                            'mode', avg_mode
                        ) FROM avg_features
                    ), '{}'::json)
                ) as result
            FROM top_tracks tt
        `;

        const result = await database.query(topTracksSql);
        const topTracksResult = result[0]?.result || { tracks: [], average_audio_features: {} };

        return {
            artist: artist,
            top_tracks: topTracksResult.tracks || [],
            average_audio_features: topTracksResult.average_audio_features || {},
            summary: {
                total_top_tracks: (topTracksResult.tracks || []).length,
                has_audio_features: Object.keys(topTracksResult.average_audio_features || {}).length > 0,
                message: (topTracksResult.tracks || []).length === 0 ? 
                    'No tracks found for this artist in any playlists' : null
            }
        };
    }
}

module.exports = {
    PlaylistService,
    ArtistService
};
