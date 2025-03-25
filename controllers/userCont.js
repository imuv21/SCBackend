import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import { validationResult } from 'express-validator';
import { User, Video } from '../models/User.js';
import sendMail from '../middlewares/sendMail.js';
import dotenv from 'dotenv';
dotenv.config();

const FRONTEND_URL = process.env.FRONTEND_URL;

//Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
const uploadToCloudinary = (buffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder: 'SaiClasses/Profiles' }, (error, result) => {
            if (error) {
                return reject(error);
            }
            resolve(result.secure_url);
        });
        stream.end(buffer);
    });
};

//Razorpay
const instance = new Razorpay({
    key_id: process.env.RAZORPAY_API_KEY,
    key_secret: process.env.RAZORPAY_API_SECRET,
});

//Pricing
const pricing = {
    6: { basePrice: 100 },
    7: { basePrice: 120 },
    8: { basePrice: 140 },
    9: { basePrice: 160 },
    10: { basePrice: 180 }
};
const subjectPrice = 50;

// Helper function to update subscription and payment history
const updateSubscriptionAndPaymentHistory = async (user, subAmount, duration, paymentDetails) => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + duration);

    const paymentRecord = {
        paidAmount: subAmount,
        duration: duration,
        paymentDate: new Date(),
        ...paymentDetails
    };
    if (user.subscription) {
        user.subscription.isActive = true;
        user.subscription.startDate = startDate;
        user.subscription.endDate = endDate;
        user.subscription.paymentHistory.push(paymentRecord);
    }
    await user.save();
};

class userCont {

    //auth conts

    static userSignup = async (req, res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: "failed", errors: errors.array() });
        }
        try {
            const { firstName, lastName, email, password, classOp, subjects } = req.body;
            const userExists = await User.findOne({ email: email });
            if (userExists) {
                return res.status(400).json({ status: "failed", message: `User already exists!` });
            }

            const salt = await bcrypt.genSalt(10);
            const hashPassword = await bcrypt.hash(password, salt);
            const otp = crypto.randomInt(100000, 999999).toString(); // Generate 6-digit OTP
            const otpExpiry = Date.now() + 2 * 60 * 1000; // OTP valid for 2 minutes

            let image = null;
            if (req.file) {
                image = await uploadToCloudinary(req.file.buffer);
            }

            const basePrice = pricing[classOp]?.basePrice || 0;
            const subAmount = basePrice + (subjects.length * subjectPrice);
            const subscription = { subAmount, isActive: false, startDate: null, endDate: null, paymentHistory: [] };
            const newUser = new User({ firstName, lastName, email, password: hashPassword, classOp, subjects, image, otp, otpExpiry, subscription });
            await newUser.save();

            setTimeout(async () => {
                const user = await User.findOne({ email: newUser.email });
                if (user && user.isVerified !== 1) {
                    if (user.image) {
                        const imageId = user.image.split('/').pop().split('.')[0];
                        await cloudinary.uploader.destroy(`SaiClasses/Profiles/${imageId}`);
                    }
                    await User.deleteOne({ _id: user._id });
                }
            }, 2 * 60 * 1000);

            const msg = `
            <div style="font-family: 'Roboto', sans-serif; width: 100%;">
                <div style="background: #5AB2FF; padding: 10px 20px; border-radius: 3px; border: none">
                    <a href="" style="font-size:1.6em; color: white; text-decoration:none; font-weight:600">Sai Classes</a>
                </div>
                <p>Hello <span style="color: #5AB2FF; font-size: 1.2em; text-transform: capitalize;">${newUser.firstName}</span>!</p>
                <p>Thank you for choosing Sai Classes. Use the following OTP to complete your Sign Up procedure. This OTP is valid for 2 minutes.</p>
                <div style="display: flex; align-items: center; justify-content: center; width: 100%;">
                    <div style="background: #5AB2FF; color: white; width: fit-content; border-radius: 3px; padding: 5px 10px; font-size: 1.4em;">${otp}</div>
                </div>
                <p>Regards,</p>
                <p>Sai Classes</p>
            </div>`;

            await sendMail(newUser.email, 'Verify your account', msg);
            return res.status(201).json({ status: "success", message: `Please verify your account using the OTP sent to ${newUser.email}` });
        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error, Please try again later!" });
        }
    }

    static verifyOtp = async (req, res) => {
        try {
            const { email, otp } = req.body;

            if (!otp) {
                return res.status(400).json({ status: "failed", message: "OTP is required!" });
            }
            const user = await User.findOne({ email: email });
            if (!user) {
                return res.status(404).json({ status: "failed", message: "User with this role doesn't exist!" });
            }
            if (user.otp !== otp) {
                return res.status(400).json({ status: "failed", message: "Invalid OTP!" });
            }
            if (Date.now() > user.otpExpiry) {
                return res.status(400).json({ status: "failed", message: "OTP expired!" });
            }
            await User.updateOne({ email },
                {
                    $unset: { otp: "", otpExpiry: "" },
                    $set: { isVerified: 1 }
                }
            );

            return res.status(200).json({ status: "success", message: "Email verified successfully. Please login now." });

        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error, Please try again later!" });
        }
    }

    static deleteUser = async (req, res) => {
        try {
            const userId = req.user._id;
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ status: "failed", message: "User not found!" });
            }
            if (user.image) {
                const imageId = user.image.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(`SaiClasses/Profiles/${imageId}`);
            }
            await User.deleteOne({ _id: user._id });
            return res.status(200).json({ status: "success", message: "User deleted successfully." });

        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error, Please try again later!" });
        }
    }

    static userLogin = async (req, res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: "failed", errors: errors.array() });
        }
        try {
            const { email, password } = req.body;
            const user = await User.findOne({ email: email });
            if (!user) {
                return res.status(404).json({ status: "failed", message: "User with this role doesn't exist!" });
            }
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ status: "failed", message: "Email or password is incorrect!" });
            }
            const token = jwt.sign({ userID: user._id }, process.env.JWT_SECRET_KEY, { expiresIn: '1d' });
            const userResponse = {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                password: password,
                classOp: user.classOp,
                subjects: user.subjects,
                image: user.image,
                isVerified: user.isVerified,
                subscription: user.subscription
            };
            return res.status(200).json({ status: "success", message: "User logged in successfully.", token, user: userResponse });

        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error, Please try again later!" });
        }
    }

    static forgotPassword = async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: "failed", errors: errors.array() });
        }
        try {
            const { email } = req.body;
            const user = await User.findOne({ email });
            if (!user) {
                return res.status(404).json({ status: "failed", message: "User doesn't exist!" });
            }

            const otp = crypto.randomInt(100000, 999999).toString(); // Generate 6-digit OTP
            const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
            await User.updateOne({ email },
                { $set: { otp, otpExpiry } }
            );

            const msg = `
            <div style="font-family: 'Roboto', sans-serif; width: 100%;">
                <div style="background: #5AB2FF; padding: 10px 20px; border-radius: 3px; border: none">
                    <a href="" style="font-size:1.6em; color: white; text-decoration:none; font-weight:600">Sai Classes</a>
                </div>
                <p>Hello <span style="color: #5AB2FF; font-size: 1.2em; text-transform: capitalize;">${user.firstName}</span>!</p>
                <p>Use the following OTP to reset your password. This OTP is valid for 10 minutes.</p>
                <div style="display: flex; align-items: center; justify-content: center; width: 100%;">
                    <div style="background: #5AB2FF; color: white; width: fit-content; border-radius: 3px; padding: 5px 10px; font-size: 1.4em;">${otp}</div>
                </div>
                <p>Regards,</p>
                <p>Sai Classes</p>
            </div>`;

            await sendMail(user.email, 'Reset Your Password', msg);
            return res.status(200).json({ status: "success", message: `OTP sent to ${user.email}.` });

        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error, please try again later!" });
        }
    };

    static verifyPasswordOtp = async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: "failed", errors: errors.array() });
        }
        try {
            const { email, otp, newPassword } = req.body;
            const user = await User.findOne({ email });
            if (!user) {
                return res.status(404).json({ status: "failed", message: "User doesn't exist!" });
            }
            if (user.otp !== otp) {
                return res.status(400).json({ status: "failed", message: "Invalid OTP!" });
            }
            if (Date.now() > user.otpExpiry) {
                return res.status(400).json({ status: "failed", message: "OTP expired!" });
            }
            const salt = await bcrypt.genSalt(10);
            const hashPassword = await bcrypt.hash(newPassword, salt);

            await User.updateOne({ email },
                {
                    $set: { password: hashPassword },
                    $unset: { otp: "", otpExpiry: "" }
                }
            );
            return res.status(200).json({ status: "success", message: "Password updated successfully." });

        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error, Please try again later!" });
        }
    };

    static updateProfile = async (req, res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: "failed", errors: errors.array() });
        }
        try {
            const { firstName, lastName, classOp, subjects } = req.body;
            const userId = req.user._id;
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ status: "failed", message: "User not found!" });
            }
            let newImageUrl = null;
            let oldImagePublicId = null;
            if (user.image) {
                oldImagePublicId = user.image.split('/').pop().split('.')[0];
            }
            if (req.file) {
                if (oldImagePublicId) {
                    try {
                        await cloudinary.uploader.destroy(`SaiClasses/Profiles/${oldImagePublicId}`);
                        console.log('Old image deleted from Cloudinary.');
                    } catch (error) {
                        console.error('Error deleting old image:', error);
                    }
                }
                try {
                    newImageUrl = await uploadToCloudinary(req.file.buffer);
                } catch (error) {
                    console.error('Error uploading new image:', error);
                }
                newImageUrl = await uploadToCloudinary(req.file.buffer);
                if (user.image) {
                    oldImagePublicId = user.image.split('/').pop().split('.')[0];
                }
            }

            user.firstName = firstName || user.firstName;
            user.lastName = lastName || user.lastName;
            user.classOp = classOp || user.classOp;
            user.subjects = subjects || user.subjects;
            if (newImageUrl) {
                user.image = newImageUrl;
            }
            await user.save();
            return res.status(200).json({ status: "success", message: "Profile updated successfully.", profile: { firstName: user.firstName, lastName: user.lastName, classOp: user.classOp, subjects: user.subjects, image: user.image } });

        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error, Please try again later!" });
        }
    }

    //stream videos

    static uploadVideo = async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: "failed", errors: errors.array() });
        }
        try {
            const { vidTitle, classOp, subject, publicId } = req.body;
            const newVideo = new Video({ vidTitle, classOp, subject, publicId });
            await newVideo.save();
            return res.status(201).json({ status: "success", message: `The video has been uploaded successfully.` });
        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error, Please try again later!" });
        }
    }

    static fetchVideos = async (req, res) => {
        try {
            let { page = 1, size = 10, search = "", classOp = null, subject = "", sortBy = "vidTitle", order = "asc" } = req.query;
            page = Math.max(1, parseInt(page));
            size = Math.max(1, Math.min(parseInt(size), 100)); 

            const filter = {};
            if (search) {
                filter.$or = [
                    { vidTitle: { $regex: search, $options: "i" } },
                ];
            }
            if (classOp) {
                filter.classOp = parseInt(classOp);
            }
            const userId = req.user._id;
            const user = await User.findById(userId).select('subjects subscription');
            if (!user || !user.subscription?.isActive) {
                return res.status(403).json({ status: "failed", message: "Subscription is required!" });
            }
            if (subject) {
                if (!user.subjects.map(s => s.toLowerCase()).includes(subject.toLowerCase())) {
                    return res.status(400).json({ status: "failed", message: "Subject not permitted!" });
                }
                filter.subject = { $regex: new RegExp(`^${subject}$`, 'i') };
            } else {
                filter.subject = { $in: user.subjects };
            }
            const sortOptions = {
                vidTitle: { vidTitle: order === "asc" ? 1 : -1 },
                createdAt: { createdAt: order === "asc" ? 1 : -1 },
            };
            const sortCriteria = sortOptions[sortBy] || sortOptions.vidTitle;
            const [videos, totalVideos] = await Promise.all([ Video.find(filter).sort(sortCriteria).skip((page - 1) * size).limit(size).lean(), Video.countDocuments(filter) ]);

            const totalPages = Math.ceil(totalVideos / size);
            const pageVideos = videos.length;
            const isFirst = page === 1;
            const isLast = page === totalPages || totalPages === 0;
            const hasNext = page < totalPages;
            const hasPrevious = page > 1;

            return res.status(200).json({ status: "success", products: videos, totalVideos, totalPages, pageVideos, isFirst, isLast, hasNext, hasPrevious });

        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error, Please try again later!" });
        }
    }

    static streamVideo = async (req, res) => {

        const range = req.headers.range;
        const { publicId, quality } = req.params;
        if (!range || !publicId) {
            return res.status(400).json({ status: "failed", message: "Range header or public id is missing!" });
        }
        const qualityTransformations = {
            '360p': 'q_auto:low,h_360',
            '480p': 'q_auto:medium,h_480',
            '720p': 'q_auto:good,h_720',
            '1080p': 'q_auto:best,h_1080'
        };
        const transformation = qualityTransformations[quality] || 'q_auto:good';
        const videoUrl = `https://res.cloudinary.com/dfsohhjfo/video/upload/${transformation}/Videos/${publicId}.mp4`;
        try {
            const headResponse = await axios.head(videoUrl);
            const fileSize = parseInt(headResponse.headers["content-length"], 10);
            const mimeType = headResponse.headers["content-type"];
            const [start, end] = range.replace(/bytes=/, "").split("-");
            const chunkStart = parseInt(start, 10);
            const chunkEnd = end ? parseInt(end, 10) : fileSize - 1;
            const contentLength = chunkEnd - chunkStart + 1;

            res.writeHead(206, {
                "Content-Range": `bytes ${chunkStart}-${chunkEnd}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": contentLength,
                "Content-Type": mimeType,
                "Cross-Origin-Resource-Policy": "cross-origin",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Range",
            });
            const videoStream = await axios({
                url: videoUrl,
                method: "get",
                responseType: "stream",
                headers: { Range: `bytes=${chunkStart}-${chunkEnd}` },
            });
            videoStream.data.pipe(res);
            videoStream.data.on("error", (err) => {
                return res.status(500).json({ status: "failed", message: "Error streaming video!" });
            });

        } catch (error) {
            return res.status(404).json({ status: "failed", message: "Video not found!" });
        }
    };

    //payment apis

    static getKey = async (req, res) => {
        return res.status(200).json({ key: process.env.RAZORPAY_API_KEY });
    }

    static buySubscription = async (req, res) => {
        const { subAmount, duration } = req.body;
        try {
            const userId = req.user._id;
            if (!subAmount) {
                return res.status(400).json({ status: "failed", message: "Amount is required!" });
            }
            const amount = parseFloat(subAmount);
            if (isNaN(amount) || amount <= 0) {
                return res.status(400).json({ status: "failed", message: "Invalid amount provided!" });
            }
            const options = {
                amount: Math.round(amount * 100), currency: 'INR',
                notes: {
                    userId: userId,
                    subAmount: subAmount,
                    duration: duration,
                }
            };
            const payment = await instance.orders.create(options);
            if (payment) {
                return res.status(200).json({ status: "success", message: "Order is created. Awaiting payment.", payment });
            } else {
                return res.status(400).json({ status: "failed", message: "Order creation failed!" });
            }
        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error, Please try again later!" });
        }
    };

    static paymentVerification = async (req, res) => {
        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
            const { userId, subAmount, duration } = req.query;

            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !subAmount || !duration) {
                return res.status(400).json({ status: "failed", message: "Razorpay credentials are missing!" });
            }
            const body = `${razorpay_order_id}|${razorpay_payment_id}`;
            const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_API_SECRET).update(body).digest('hex');
            const isAuthentic = expectedSignature === razorpay_signature;

            if (isAuthentic) {
                const user = await User.findById(userId);
                if (!user) {
                    return res.status(404).json({ status: "failed", message: "User not found!" });
                }
                await updateSubscriptionAndPaymentHistory(user, subAmount, duration, {
                    razorpay_order_id,
                    razorpay_payment_id,
                    razorpay_signature
                });
                return res.redirect(`${FRONTEND_URL}payment-success?reference=${razorpay_payment_id}`);
            } else {
                return res.status(400).json({ status: "failed", message: "Invalid signature. Payment verification failed!" });
            }
        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error, Please try again later!" });
        }
    };
}

export default userCont;