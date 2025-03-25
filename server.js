import { createServer } from "http";
import { app } from "./app.js";
import cron from 'node-cron';
import { User } from "./models/User.js";
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT;
const NODE_ENV = process.env.NODE_ENV;
const server = createServer(app);

// Cron schedule
cron.schedule('0 0 * * *', async () => {
    const users = await User.find();
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