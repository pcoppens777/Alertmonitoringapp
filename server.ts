import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database('alerts.db');

// Mirror console logs to DB for remote debugging
const originalLog = console.log;
const originalError = console.error;

function logToDb(event: string, data: any) {
  try {
    const logId = uuidv4();
    const timestamp = Date.now();
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    db.prepare('INSERT INTO debug_logs (id, timestamp, event, data) VALUES (?, ?, ?, ?)')
      .run(logId, timestamp, event, dataStr);
  } catch (e) {
    // Fallback to original log if DB fails
  }
}

console.log = (...args) => {
  originalLog(...args);
  logToDb('CONSOLE', args.join(' '));
};

console.error = (...args) => {
  originalError(...args);
  logToDb('ERROR', args.join(' '));
};

let ioInstance: any = null;

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT,
    price REAL,
    timestamp INTEGER NOT NULL,
    imageUrl TEXT,
    interval TEXT
  );
  CREATE TABLE IF NOT EXISTS traffic (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    method TEXT,
    path TEXT,
    headers TEXT,
    body TEXT
  );
  CREATE TABLE IF NOT EXISTS debug_logs (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    event TEXT,
    data TEXT
  );
`);

// Migration: Add interval column if it doesn't exist
try {
  db.exec(`ALTER TABLE alerts ADD COLUMN interval TEXT`);
} catch (e) {
  // Column already exists
}

const SERVER_ID = 'V3-' + uuidv4().slice(0, 6);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  app.use(cors());

  // 1. Deep Trace Logger (Before EVERYTHING)
  app.use((req, res, next) => {
    const isAsset = req.path.startsWith('/@vite') || req.path.startsWith('/src') || req.path.includes('.');
    const traceId = uuidv4().slice(0, 4);
    const timestamp = Date.now();
    
    if (!isAsset) {
      // Log to console for platform logs
      console.log(`[TRACE-${traceId}] ${req.method} ${req.path} - UA: ${req.headers['user-agent']}`);
      
      try {
        db.prepare('INSERT INTO debug_logs (id, timestamp, event, data) VALUES (?, ?, ?, ?)')
          .run(uuidv4(), timestamp, 'TRACE', JSON.stringify({
            traceId,
            method: req.method,
            path: req.path,
            headers: req.headers,
            ip: req.headers['x-forwarded-for'] || req.ip,
            query: req.query
          }));
      } catch (e) {}
    }
    next();
  });

  // 2. Body Parsers
  app.use(express.text({ type: '*/*', limit: '1mb' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  ioInstance = io;

  app.get(['/api/webhook', '/api/webhook/'], (req, res) => {
    res.send('Webhook endpoint is active. Use POST to send alerts.');
  });

  app.get('/api/traffic', (req, res) => {
    const logs = db.prepare('SELECT * FROM traffic ORDER BY timestamp DESC LIMIT 50').all();
    res.json(logs);
  });

  app.post(['/api/webhook', '/api/webhook/'], (req, res) => {
    const timestamp = Date.now();
    const requestId = uuidv4();
    
    console.log(`>>> WEBHOOK POST RECEIVED: ${req.path}`);
    
    let rawBody = req.body;
    
    // If body is an object (from express.json), stringify it for the traffic log
    const logBody = typeof rawBody === 'object' ? JSON.stringify(rawBody) : String(rawBody);

    // Log to DB immediately
    try {
      const insertTraffic = db.prepare(`
        INSERT INTO traffic (id, timestamp, method, path, headers, body)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertTraffic.run(requestId, timestamp, req.method, req.path, JSON.stringify(req.headers), logBody);
    } catch (e) {
      console.error('Traffic log error:', e);
    }

    console.log(`>>> Webhook received: ${logBody}`);
    
    // Emit traffic event
    io.emit('webhook_traffic', {
      timestamp,
      method: req.method,
      path: req.path,
      headers: req.headers,
      body: logBody
    });

    let data: any = {};

    // Robust Parsing Logic
    if (typeof rawBody === 'string' && rawBody.trim().length > 0) {
      try {
        // Try JSON first
        data = JSON.parse(rawBody);
      } catch (e) {
        // Try Pipe format: SYMBOL|CATEGORY|MESSAGE|PRICE|INTERVAL
        if (rawBody.includes('|')) {
          const parts = rawBody.split('|');
          data = {
            symbol: parts[0]?.trim() || 'ALERT',
            category: parts[1]?.trim() || 'SIGNAL',
            message: parts[2]?.trim() || rawBody,
            price: parts[3]?.trim() || '0',
            interval: parts[4]?.trim() || null
          };
        } else {
          // Last resort: Try to extract symbol from the beginning of the message
          // e.g., "BTCUSD, 1 Crossing Trend Line" -> symbol: "BTCUSD"
          let extractedSymbol = 'ALERT';
          let extractedMessage = rawBody;
          
          const firstCommaIndex = rawBody.indexOf(',');
          const firstSpaceIndex = rawBody.indexOf(' ');
          
          if (firstCommaIndex > 0 && firstCommaIndex < 15) {
            extractedSymbol = rawBody.substring(0, firstCommaIndex).trim();
            extractedMessage = rawBody.substring(firstCommaIndex + 1).trim();
          } else if (firstSpaceIndex > 0 && firstSpaceIndex < 15) {
            extractedSymbol = rawBody.substring(0, firstSpaceIndex).trim();
            extractedMessage = rawBody.substring(firstSpaceIndex + 1).trim();
          }

          data = {
            symbol: extractedSymbol,
            category: 'SIGNAL',
            message: extractedMessage
          };
        }
      }
    } else if (typeof rawBody === 'object' && rawBody !== null && Object.keys(rawBody).length > 0) {
      data = rawBody;
    } else {
      // Empty body
      data = {
        symbol: 'EMPTY',
        category: 'DEBUG',
        message: 'Received an empty webhook body'
      };
    }

    let { symbol, category, message, price, imageUrl, interval } = data;
    
    // Default values if missing
    symbol = (symbol || 'ALERT').toString().toUpperCase();
    category = (category || 'SIGNAL').toString().toUpperCase();
    
    const alert = {
      id: uuidv4(),
      symbol,
      category,
      message: (message || '').toString(),
      price: parseFloat(price) || 0,
      timestamp: Date.now(),
      imageUrl: imageUrl || null,
      interval: interval ? interval.toString() : null
    };

    try {
      const insert = db.prepare(`
        INSERT INTO alerts (id, symbol, category, message, price, timestamp, imageUrl, interval)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insert.run(alert.id, alert.symbol, alert.category, alert.message, alert.price, alert.timestamp, alert.imageUrl, alert.interval);
      
      console.log('>>> Alert Saved:', alert.symbol);
      io.emit('new_alert', alert);
      res.status(200).json({ status: 'success', id: alert.id });
    } catch (error) {
      console.error('Database Error:', error);
      res.status(500).json({ error: 'Failed to save alert' });
    }
  });

  // API Routes
  app.get('/api/status', (req, res) => {
    res.json({
      serverId: SERVER_ID,
      uptime: process.uptime(),
      timestamp: Date.now(),
      memory: process.memoryUsage()
    });
  });

  app.get('/api/debug', (req, res) => {
    const logs = db.prepare('SELECT * FROM debug_logs ORDER BY timestamp DESC LIMIT 100').all();
    res.json(logs);
  });

  app.get('/api/debug/clear', (req, res) => {
    db.prepare('DELETE FROM debug_logs').run();
    db.prepare('DELETE FROM traffic').run();
    res.json({ status: 'cleared' });
  });

  app.get('/api/alerts', (req, res) => {
    const alerts = db.prepare('SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 100').all();
    res.json(alerts);
  });

  // Catch-all for API to find misdirected TradingView hits (Moved to end of API routes)
  app.all('/api/*', (req, res) => {
    console.log(`!!! UNHANDLED API CALL: ${req.method} ${req.path}`);
    res.status(404).json({ 
      status: 'error', 
      message: 'API endpoint not found', 
      path: req.path,
      suggestion: 'If you are trying to hit the webhook, use /api/webhook'
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
