import { createServer } from "http";
import { Server } from "socket.io";
import { app } from "./app.js";
import cron from 'node-cron';
import { userModel } from "./models/User.js";
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT;
const NODE_ENV = process.env.NODE_ENV;
const allowedOrigins = [
    "http://localhost:5173",
    "https://saiclasses.netlify.app/"
];

const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        credentials: true
    }
});
app.set('socketio', io);

// Socket.io
io.on('connection', (socket) => {
    console.log(`User connected with id ${socket.id}`);

    // User joins a room with their userId and receiverId (both are needed to identify the chat)
    socket.on('joinRoom', ({ senderId, receiverId }) => {
        const roomId = [senderId, receiverId].sort().join('_'); // Ensure the room ID is the same for both users
        socket.join(roomId);
        console.log(`User ${senderId} joined room: ${roomId}`);
    });

    // Handle sending and broadcasting a message
    socket.on('newMessage', (message) => {
        const { senderId, receiverId, content } = message;
        const roomId = [senderId, receiverId].sort().join('_');
        const timestamp = new Date().toISOString();

        const msgPayload = {
            sender: { _id: senderId },
            receiver: { _id: receiverId },
            content,
            timestamp,
        };

        // Emit the message to all clients in the room (sender and receiver)
        io.to(roomId).emit('newMessage', msgPayload);
        console.log(`Message from ${senderId} to ${receiverId}: ${content}`);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected with id ${socket.id}`);
    });
});

// Cron schedule
cron.schedule('0 0 * * *', async () => {
    const users = await userModel.find();
    const now = new Date();

    for (const user of users) {
        if (user.subscription.isActive && user.subscription.endDate < now) {
        
            user.subscription.isActive = false;
            user.subscription.startDate = null;
            user.subscription.endDate = null;
            await user.save();
        }
    }
});

// Listening to ports
server.listen(PORT, () => {
    if (NODE_ENV !== 'pro') {
        console.log(`Server listening at http://localhost:${PORT}`);
    } else {
        console.log('Server is running in production mode');
    }
});