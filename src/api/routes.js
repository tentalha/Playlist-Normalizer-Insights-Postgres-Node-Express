const express = require('express');
const { PlaylistController, ArtistController } = require('./controller');

const router = express.Router();
const playlistController = new PlaylistController();
const artistController = new ArtistController();

// Health check endpoint
router.get('/', (_, res) => {
    res.json({ 
        message: 'Playlist Normalizer API',
        endpoints: [
            'GET /playlists/:id/tracks?energyMin=0.7',
            'GET /artists/:id/summary'
        ]
    });
});

// Endpoint 1: Get playlist tracks filtered by energy with embedded artist + album objects
router.get('/playlists/:id/tracks', playlistController.getPlaylistTracks.bind(playlistController));

// Endpoint 2: Get artist summary with top tracks and average audio features
router.get('/artists/:id/summary', artistController.getArtistSummary.bind(artistController));

module.exports = router;
