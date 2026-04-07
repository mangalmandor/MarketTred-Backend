require('dotenv').config();

const http = require('http');
const app = require('./app');
const { connectDB } = require('./config/database');
const { initSocket } = require('./services/socketService');

const server = http.createServer(app);

initSocket(server);
initItemsCleanup();

const PORT = process.env.PORT || 5000;

connectDB()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Swagger Docs available at http://localhost:${PORT}/api-docs`);
        });
    })
    .catch((err) => {
        console.error('Failed to connect to database', err);
    });
