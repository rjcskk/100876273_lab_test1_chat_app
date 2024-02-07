const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/studentChatApp', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected...'))
.catch(err => console.error(err));

// Serve HTML files from 'views' directory
app.use(express.static(path.join(__dirname, 'views')));

// Track users in chat rooms
const roomUsers = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', async ({ username, room }) => {
        socket.join(room);
        
        // Add user to room
        if (!roomUsers[room]) {
            roomUsers[room] = [];
        }
        roomUsers[room].push({ id: socket.id, username });
        updateRoomUsers(room);

        // Fetch all messages for the room and emit
        const messages = await Message.find({ room }).sort({ timestamp: 1 });
        socket.emit('messageHistory', messages);

        // Notify the room of the new user
        socket.broadcast.to(room).emit('message', { text: `${username} has joined the chat`, username: 'System' });

        // Handle sending messages
        socket.on('sendMessage', async ({ message }) => {
            const msg = new Message({ room, username, message });
            await msg.save();
            io.to(room).emit('message', { username, text: message });
        });

        // Handle user leaving the room
        socket.on('disconnect', () => {
            // Remove user from room
            roomUsers[room] = roomUsers[room].filter(user => user.id !== socket.id);
            updateRoomUsers(room);
            socket.broadcast.to(room).emit('message', { text: `${username} has left the chat`, username: 'System' });
        });
    });
});

function updateRoomUsers(room) {
    io.to(room).emit('roomUsers', roomUsers[room].map(user => user.username));
}

// Registration route for new users
app.post('/register', express.json(), async (req, res) => {
    const { username, firstName, lastName, password } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
        return res.status(400).send({ message: 'Username already exists.' });
    }
    
    const newUser = new User({ username, firstName, lastName, password });
    await newUser.save();
    res.status(200).send({ success: true, message: 'Registration successful.' });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

