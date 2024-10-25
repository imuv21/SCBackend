import express from 'express';
import { videoValidator } from '../middlewares/validation.js';
import authedUser from '../middlewares/authedUser.js';
import userCont from '../controllers/userCont.js';
const router = express.Router();

// Public routes
router.post('/upload-video', videoValidator, userCont.uploadVideo);
router.post('/paymentverify', userCont.paymentVerification);

// Private routes
router.use(authedUser);
router.get('/videos', userCont.fetchVideos);

router.get('/getkey', userCont.getKey);
router.post('/buysub', userCont.buySubscription);

export default router;