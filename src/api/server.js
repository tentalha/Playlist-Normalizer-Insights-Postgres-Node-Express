const express = require('express');
const cors = require('cors');
const database = require('../config/database');
const routes = require('./routes');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database connection
async function initializeDatabase() {
    try {
        await database.connect();
        console.log('Database connected successfully');
    } catch (error) {
        console.error('Failed to connect to database:', error);
        process.exit(1);
    }
}

// Use routes
app.use('/', routes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Something went wrong!',
        message: err.message 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        available_endpoints: [
            'GET /',
            'GET /playlists/:id/tracks?energyMin=0.7',
            'GET /artists/:id/summary'
        ]
    });
});

// Start server
async function startServer() {
    await initializeDatabase();
    
    app.listen(PORT, () => {
        console.log(`Playlist Normalizer API running on port ${PORT}`);
        console.log(`Available endpoints:`);
        console.log(`   GET http://localhost:${PORT}/`);
        console.log(`   GET http://localhost:${PORT}/playlists/:id/tracks?energyMin=0.7`);
        console.log(`   GET http://localhost:${PORT}/artists/:id/summary`);
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await database.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    await database.close();
    process.exit(0);
});

startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

module.exports = app;
