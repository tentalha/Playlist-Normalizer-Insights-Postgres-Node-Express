const { Pool } = require('pg');
require('dotenv').config();

class Database {
    constructor() {
        this.connection = null;
        this.pool = null;
    }

    async connect() {
        try {
            this.pool = new Pool({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 5432,
                database: process.env.DB_NAME || 'playlist_normalizer',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || '',
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });
            
            // Test connection
            const client = await this.pool.connect();
            client.release();
            console.log('Connected to PostgreSQL database');
        } catch (error) {
            console.error('Database connection failed:', error);
            throw error;
        }
    }

    async query(sql, params = []) {
        try {
            const result = await this.pool.query(sql, params);
            return result.rows;
        } catch (error) {
            console.error('Query failed:', error);
            throw error;
        }
    }

    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('Database connection closed');
        }
    }

    // Helper method to build upsert queries
    buildUpsertQuery(table, data, conflictColumns, updateColumns) {
        const columns = Object.keys(data);
        const values = columns.map((_, i) => `$${i + 1}`);
        
        if (updateColumns.length === 0) {
            // No updates needed, just insert or ignore on conflict
            return {
                sql: `INSERT INTO ${table} (${columns.join(', ')}) 
                      VALUES (${values.join(', ')}) 
                      ON CONFLICT (${conflictColumns.join(', ')}) 
                      DO NOTHING`,
                params: Object.values(data)
            };
        } else {
            // Standard upsert with updates
            const updates = updateColumns.map(col => `${col} = EXCLUDED.${col}`);
            return {
                sql: `INSERT INTO ${table} (${columns.join(', ')}) 
                      VALUES (${values.join(', ')}) 
                      ON CONFLICT (${conflictColumns.join(', ')}) 
                      DO UPDATE SET ${updates.join(', ')}`,
                params: Object.values(data)
            };
        }
    }
}

module.exports = new Database();
