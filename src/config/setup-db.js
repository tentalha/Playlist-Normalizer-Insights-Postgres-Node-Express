const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class DatabaseSetup {
    constructor() {
        this.dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'playlist_normalizer'
        };
    }

    async createDatabase() {
        console.log(`Setting up PostgreSQL database: ${this.dbConfig.database}`);
        await this.createPostgresDatabase();
    }

    async createPostgresDatabase() {
        // Connect to postgres database (default) to create our database
        const adminPool = new Pool({
            host: this.dbConfig.host,
            port: this.dbConfig.port,
            user: this.dbConfig.user,
            password: this.dbConfig.password,
            database: 'postgres' // Connect to default postgres database
        });

        try {
            // Check if database exists
            const checkResult = await adminPool.query(
                'SELECT 1 FROM pg_database WHERE datname = $1',
                [this.dbConfig.database]
            );

            if (checkResult.rows.length === 0) {
                console.log(`Creating PostgreSQL database: ${this.dbConfig.database}`);
                await adminPool.query(`CREATE DATABASE "${this.dbConfig.database}"`);
                console.log('Database created successfully');
            } else {
                console.log('Database already exists');
            }

            await adminPool.end();

            // Now connect to the created database and run schema
            await this.runSchema();

        } catch (error) {
            await adminPool.end();
            throw error;
        }
    }


    async runSchema() {
        console.log('Running PostgreSQL schema...');
        
        const pool = new Pool({
            host: this.dbConfig.host,
            port: this.dbConfig.port,
            user: this.dbConfig.user,
            password: this.dbConfig.password,
            database: this.dbConfig.database
        });

        try {
            const schemaPath = path.join(__dirname, '../../db/postgres/schema.sql');
            const schema = await fs.readFile(schemaPath, 'utf8');
            
            await pool.query(schema);
            console.log('PostgreSQL schema applied successfully');
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error('Schema file not found:', error.path);
            } else {
                console.error('Error applying schema:', error.message);
            }
            throw error;
        } finally {
            await pool.end();
        }
    }


    async testConnection() {
        console.log('Testing database connection...');
        
        const pool = new Pool(this.dbConfig);
        try {
            const result = await pool.query('SELECT version()');
            console.log('PostgreSQL connection successful');
            console.log('   Version:', result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]);
            await pool.end();
        } catch (error) {
            await pool.end();
            throw error;
        }
    }
}

// CLI execution
async function main() {
    try {
        const setup = new DatabaseSetup();
        
        console.log('Database Setup Starting...');
        console.log(`Database Type: PostgreSQL`);
        console.log(`Host: ${setup.dbConfig.host}:${setup.dbConfig.port}`);
        console.log(`Database: ${setup.dbConfig.database}`);
        console.log(`User: ${setup.dbConfig.user}`);
        console.log('');

        await setup.createDatabase();
        await setup.testConnection();
        
        console.log('');
        console.log('Database setup completed successfully!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Run: npm run ingest -- --from fixtures/playlist.basic.json --features fixtures/audio_features.json');
        console.log('2. Run: npm start');
        
    } catch (error) {
        console.error('Database setup failed:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.error('');
            console.error('Connection refused. Please ensure:');
            console.error('- Database server is running');
            console.error('- Host and port are correct in .env file');
            console.error('- User credentials are valid');
        } else if (error.code === 'ENOTFOUND') {
            console.error('');
            console.error('Host not found. Please check the DB_HOST in .env file');
        } else if (error.code === '28P01') {
            console.error('');
            console.error('Authentication failed. Please check DB_USER and DB_PASSWORD in .env file');
        }
        
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = DatabaseSetup;
