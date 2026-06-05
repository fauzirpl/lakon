// db.js - MySQL connection pool using mysql2/promise
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'workplan_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test database connection pool health
pool.getConnection()
  .then(connection => {
    console.log('Successfully connected to MySQL database: workplan_db');
    connection.release();
  })
  .catch(err => {
    console.error('Error connecting to MySQL database:');
    console.error(err.message);
    console.error('Make sure Laragon/MySQL is running on port 3306 and database workplan_db exists.');
  });

module.exports = pool;
