import { io } from 'socket.io-client';

// Get server URL from environment or use default
const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';

// Initialize socket connection
const socket = io(serverUrl, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
});

// DOM elements
const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');
const nameInput = document.getElementById('nameInput');
const sendHelloBtn = document.getElementById('sendHello');
const latencyEl = document.getElementById('latency');
const testApiBtn = document.getElementById('testApi');
const apiResponseEl = document.getElementById('apiResponse');

// Update connection status
function updateStatus(connected) {
    statusEl.textContent = connected ? 'Connected' : 'Disconnected';
    statusEl.className = `status ${connected ? 'connected' : 'disconnected'}`;
    sendHelloBtn.disabled = !connected;
}

// Add message to the messages area
function addMessage(content, type = 'received') {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;
    
    const time = new Date().toLocaleTimeString();
    messageEl.innerHTML = `
        <div>${content}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesEl.appendChild(messageEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Socket event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    updateStatus(true);
    addMessage('Connected to Motosai server!');
    startLatencyCheck();
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateStatus(false);
    addMessage('Disconnected from server');
});

socket.on('welcome', (data) => {
    console.log('Welcome message:', data);
    addMessage(`Server: ${data.message} (ID: ${data.socketId})`);
});

socket.on('hello-response', (data) => {
    console.log('Hello response:', data);
    addMessage(`Server: ${data.message}`);
});

socket.on('pong', (timestamp) => {
    const latency = Date.now() - timestamp;
    latencyEl.textContent = `Latency: ${latency} ms`;
});

// Send hello message
sendHelloBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || 'World';
    const message = {
        name: name,
        timestamp: new Date().toISOString()
    };
    
    socket.emit('hello', message);
    addMessage(`You: Hello from ${name}!`, 'sent');
});

// Test REST API
testApiBtn.addEventListener('click', async () => {
    try {
        const response = await fetch(`${serverUrl}/api/hello`);
        const data = await response.json();
        
        apiResponseEl.style.display = 'block';
        apiResponseEl.textContent = JSON.stringify(data, null, 2);
        
        addMessage('REST API test successful!');
    } catch (error) {
        apiResponseEl.style.display = 'block';
        apiResponseEl.textContent = `Error: ${error.message}`;
        
        addMessage(`API Error: ${error.message}`);
    }
});

// Latency check
function startLatencyCheck() {
    setInterval(() => {
        if (socket.connected) {
            socket.emit('ping', Date.now());
        }
    }, 5000);
}

// Allow Enter key to send hello
nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendHelloBtn.disabled) {
        sendHelloBtn.click();
    }
});

// Initial status
updateStatus(false);