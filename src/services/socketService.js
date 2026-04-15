const { Server } = require('socket.io');
const { verifyToken } = require('../utils/paseto');
const User = require('../models/User');

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

    // Authentication Middleware
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

    io.on('connection', async (socket) => {
        const userId = socket.userId.toString();

        // ==========================================
        // 1. ONLINE STATUS LOGIC
        // ==========================================
        if (!userSockets.has(userId)) {
            userSockets.set(userId, []);

            // Jab user pehli baar connect ho (pehla tab khule)

            await User.findByIdAndUpdate(userId, { isOnline: true });
            // Sabko batao ki Mars online aa gaya hai
        }
        userSockets.get(userId).push(socket.id);

        console.log(`User ${userId} connected.`);
        socket.broadcast.emit('requestStatus', { requesterId: userId });
        io.emit('statusUpdate', { userId, isOnline: true });

        // ==========================================
        // 2. EXISTING LISTENERS (Message, Typing, etc.)
        // ==========================================
        socket.on('sendMessage', (data) => {
            const targetUser = data.receiverId || data.receiver?._id || data.receiver;
            if (targetUser) {
                sendRealTimeMessage(targetUser.toString(), data);
            }
        });
        socket.on('requestStatus', (data) => {
            const { targetUserId, requesterId } = data;
            const targetSockets = userSockets.get(targetUserId.toString());

            if (targetSockets && targetSockets.length > 0) {
                // Agar target user online hai, toh uske sockets ko bolo ki requester ko reply dein
                targetSockets.forEach(socketId => {
                    io.to(socketId).emit('getPresenceRequest', { requesterId });
                });
            }
        });

        socket.on('respondStatus', (data) => {
            const { requesterId, status, lastSeen } = data;
            const requesterSockets = userSockets.get(requesterId.toString());

            if (requesterSockets) {
                // Requester ko batao ki main online hoon
                requesterSockets.forEach(socketId => {
                    io.to(socketId).emit('statusUpdate', {
                        userId: socket.userId,
                        isOnline: status,
                        lastSeen
                    });
                });
            }
        });

        socket.on('typing', (data) => {
            const targetSockets = userSockets.get(data.receiverId.toString());
            if (targetSockets) {
                targetSockets.forEach(socketId => io.to(socketId).emit('userTyping', data));
            }
        });

        socket.on('stopTyping', (data) => {
            const targetSockets = userSockets.get(data.receiverId.toString());
            if (targetSockets) {
                targetSockets.forEach(socketId => io.to(socketId).emit('userStoppedTyping', data));
            }
        });

        // ==========================================
        // 3. DISCONNECT & LAST SEEN LOGIC
        // ==========================================
        socket.on('disconnect', async () => {
            const userConnections = userSockets.get(userId);
            if (userConnections) {
                const updatedConnections = userConnections.filter(id => id !== socket.id);

                if (updatedConnections.length === 0) {
                    // Jab user ne saare tabs band kar diye (Last seen yahan trigger hoga)
                    userSockets.delete(userId);
                    const now = new Date();

                    try {
                        await User.findByIdAndUpdate(userId, {
                            isOnline: false,
                            lastSeen: now
                        });
                        // Sabko batao ki user offline gaya aur uska last seen kya hai
                        io.emit('statusUpdate', { userId, isOnline: false, lastSeen: now });
                        console.log(`User ${userId} is now offline.`);
                    } catch (err) {
                        console.error("Error updating last seen:", err);
                    }
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