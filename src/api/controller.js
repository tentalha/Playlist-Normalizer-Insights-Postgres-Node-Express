const { PlaylistService, ArtistService } = require('./service');

class PlaylistController {
    constructor() {
        this.playlistService = new PlaylistService();
    }

    async getPlaylistTracks(req, res) {
        try {
            const playlistId = req.params.id;
            const energyMin = parseFloat(req.query.energyMin) || 0;

            // Validate energy parameter
            if (isNaN(energyMin) || energyMin < 0 || energyMin > 1) {
                return res.status(400).json({ 
                    error: 'energyMin must be a number between 0 and 1' 
                });
            }

            const result = await this.playlistService.getPlaylistTracksData(playlistId, energyMin);
            res.json(result);

        } catch (error) {
            console.error('Error fetching playlist tracks:', error);
            
            if (error.status === 404) {
                return res.status(404).json({ 
                    error: error.message,
                    playlist_id: error.playlist_id 
                });
            }
            
            if (error.message.includes('required') || error.message.includes('energyMin')) {
                return res.status(400).json({ 
                    error: error.message 
                });
            }
            
            res.status(500).json({ 
                error: 'Internal server error',
                message: error.message 
            });
        }
    }
}

class ArtistController {
    constructor() {
        this.artistService = new ArtistService();
    }

    async getArtistSummary(req, res) {
        try {
            const artistId = req.params.id;
            
            const result = await this.artistService.getArtistSummaryData(artistId);
            res.json(result);

        } catch (error) {
            console.error('Error fetching artist summary:', error);
            
            if (error.status === 404) {
                return res.status(404).json({ 
                    error: error.message,
                    artist_id: error.artist_id 
                });
            }
            
            if (error.message.includes('required')) {
                return res.status(400).json({ 
                    error: error.message 
                });
            }
            
            res.status(500).json({ 
                error: 'Internal server error',
                message: error.message 
            });
        }
    }
}

module.exports = {
    PlaylistController,
    ArtistController
};
