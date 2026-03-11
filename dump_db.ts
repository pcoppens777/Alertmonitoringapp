
import Database from 'better-sqlite3';
const db = new Database('alerts.db');

console.log('--- DEBUG LOGS (Last 20) ---');
const debugLogs = db.prepare('SELECT * FROM debug_logs ORDER BY timestamp DESC LIMIT 20').all();
console.log(JSON.stringify(debugLogs, null, 2));

console.log('\n--- TRAFFIC LOGS (Last 20) ---');
const trafficLogs = db.prepare('SELECT * FROM traffic ORDER BY timestamp DESC LIMIT 20').all();
console.log(JSON.stringify(trafficLogs, null, 2));

console.log('\n--- ALERTS (Last 10) ---');
const alerts = db.prepare('SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 10').all();
console.log(JSON.stringify(alerts, null, 2));
