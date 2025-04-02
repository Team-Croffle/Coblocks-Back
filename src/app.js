const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const { logger } = require('./utils/logger');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes
app.use('/api', apiRoutes);
app.use('/auth', authRoutes);

// WebSocket connection handling
wss.on('connection', (ws) => {
    logger.info('New client connected');

    ws.on('message', (message) => {
        logger.info(`Received message: ${message}`);
        // Handle incoming messages and broadcast to other clients as needed
    });

    ws.on('close', () => {
        logger.info('Client disconnected');
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
});