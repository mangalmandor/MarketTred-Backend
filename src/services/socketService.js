const { Server } = require('socket.io');
const { verifyToken } = require('../utils/paseto');

let io;
const userSockets = new Map();

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:5173',
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error('Authentication error'));

            const payload = await verifyToken(token);
            socket.userId = payload.userId;
            next();
        } catch (err) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.userId.toString();

        if (!userSockets.has(userId)) {
            userSockets.set(userId, []);
        }
        userSockets.get(userId).push(socket.id);

        console.log(`User ${userId} connected.`);

        socket.on('sendMessage', (data) => {
            console.log("📨 Message received on server:", data);
            if (data.receiverId) {
                sendRealTimeMessage(data.receiverId, data);
            }
        });

        socket.on('disconnect', () => {
            const userConnections = userSockets.get(userId);
            if (userConnections) {
                const updatedConnections = userConnections.filter(id => id !== socket.id);
                if (updatedConnections.length === 0) {
                    userSockets.delete(userId);
                } else {
                    userSockets.set(userId, updatedConnections);
                }
            }
        });
    });

    return io;
};

const sendRealTimeMessage = (receiverId, messageData) => {
    if (!io) return;
    const targetSockets = userSockets.get(receiverId.toString());

    if (targetSockets) {
        targetSockets.forEach(socketId => {
            io.to(socketId).emit('receiveMessage', messageData);
            io.to(socketId).emit('new_inquiry', messageData);
        });
    }
};

const getIo = () => {
    if (!io) throw new Error('Socket.io not initialized!');
    return io;
};

module.exports = { initSocket, sendRealTimeMessage, getIo };