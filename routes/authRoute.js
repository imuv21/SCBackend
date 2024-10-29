import express from 'express';
import { signupValidator, loginValidator } from '../middlewares/validation.js';
import upload from '../middlewares/upload.js';
import authedUser from '../middlewares/authedUser.js';
import rateLimiter from '../middlewares/rateLimiter.js';
import userCont from '../controllers/userCont.js';
const router = express.Router();

// Public routes
router.post('/signup', upload.single('image'), signupValidator, userCont.userSignup);
router.post('/verify-otp', userCont.verifyOtp);
router.post('/login', loginValidator, userCont.userLogin);
router.get('/logout', userCont.userLogout);

// Private routes
router.use(authedUser);
router.put('/update-profile', rateLimiter({ windowMs: 60 * 60 * 1000, max: 10 }), upload.single('image'), userCont.userProfileUpdate);
router.delete('/delete-user', userCont.deleteUser);

export default router;