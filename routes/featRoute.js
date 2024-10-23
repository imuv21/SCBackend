import express from 'express';
import { videoValidator } from '../middlewares/validation.js';
import authedUser from '../middlewares/authedUser.js';
import userCont from '../controllers/userCont.js';
const router = express.Router();

// Public routes
router.post('/upload-video', videoValidator, userCont.uploadVideo);

// Private routes
router.use(authedUser);
router.get('/videos', userCont.fetchVideos);
router.post('/buy-sub', userCont.buySubscription);


// router.post('/bla', userCont.bla);

export default router;