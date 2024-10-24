
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/connectDB.js';
import authRoute from './routes/authRoute.js';
import featRoute from './routes/featRoute.js';
import dotenv from 'dotenv';
dotenv.config();
export const app = express();

const DATABASE_URL = process.env.DATABASE_URL

// Security Headers
app.use(helmet());

// CORS
// CORS
const allowedOrigins = [
    "http://localhost:5173",
    "https://saiclasses.netlify.app"
];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: "GET,POST,PUT,PATCH,DELETE",
    credentials: true
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300 // limit each IP to 300 requests per windowMs
});
app.use(limiter);

//Database connection
connectDB(DATABASE_URL);

//JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//Loading routes
app.use("/api/v1/auth", authRoute);
app.use("/api/v1/feat", featRoute);

