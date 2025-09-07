const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
});

// Health check endpoint for Cloud Run
app.get('/', (req, res) => {
  res.json({ 
    message: 'Motosai Server Running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Hello World REST endpoint
app.get('/api/hello', (req, res) => {
  res.json({ 
    message: 'Hello World from Motosai!',
    server: 'motosai-websocket',
    time: new Date().toISOString()
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Send welcome message
  socket.emit('welcome', {
    message: 'Welcome to Motosai WebSocket Server!',
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });
  
  // Handle hello event
  socket.on('hello', (data) => {
    console.log('Received hello from client:', data);
    socket.emit('hello-response', {
      message: `Hello ${data.name || 'World'} from Motosai Server!`,
      echo: data,
      timestamp: new Date().toISOString()
    });
  });
  
  // Handle ping for latency testing
  socket.on('ping', (timestamp) => {
    socket.emit('pong', timestamp);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`Motosai server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});