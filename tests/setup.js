// Jest setup file for global test configuration
require('dotenv').config({ path: '.env' });

// Mock console.log for cleaner test output
global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME || 'playlist_normalizer_test';

// Global test timeout
jest.setTimeout(30000);
