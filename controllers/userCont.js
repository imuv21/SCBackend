import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { validationResult } from 'express-validator';
import { v2 as cloudinary } from 'cloudinary';
import { userModel, videoModel } from '../models/User.js';
import dotenv from 'dotenv';
dotenv.config();
import sendMail from '../middlewares/sendMail.js';

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

const pricing = {
    6: { basePrice: 100 },
    7: { basePrice: 120 },
    8: { basePrice: 140 },
    9: { basePrice: 160 },
    10: { basePrice: 180 }
};
const subjectPrice = 50;

class userCont {

    //auth conts

    static userSignup = async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { firstName, lastName, email, password, confirmPassword, classOp, subjects } = req.body;

        const user = await userModel.findOne({ email: email });
        if (user) {
            return res.status(400).send({ "status": "failed", "message": `User already exists` });
        } else {
            if (firstName && lastName && email && password && confirmPassword && classOp && subjects) {
                if (password !== confirmPassword) {
                    res.status(400).send({ "status": "failed", "message": "Passwords do not match" });
                } else {
                    try {
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
                        const subscription = { subAmount, isActive: false, startDate: null, endDate: null };
                        const newUser = new userModel({ firstName, lastName, email, password: hashPassword, classOp, subjects, image, otp, otpExpiry, subscription });
                        await newUser.save();

                        setTimeout(async () => {
                            const user = await userModel.findOne({ email: newUser.email });
                            if (user && user.isVerified !== 1) {
                                if (user.image) {
                                    const imageId = user.image.split('/').pop().split('.')[0];
                                    await cloudinary.uploader.destroy(`SaiClasses/Profiles/${imageId}`);
                                }
                                await userModel.deleteOne({ _id: user._id });
                            }
                        }, 2 * 60 * 1000);

                        const msg = `<div style="font-family: 'Roboto', sans-serif; width: 100%;">
        <div style="background: #5AB2FF; padding: 10px 20px; border-radius: 3px; border: none">
            <a href="" style="font-size:1.6em; color: white; text-decoration:none; font-weight:600">MarketPlace</a>
        </div>
        <p>Hello <span style="color: #5AB2FF; font-size: 1.2em; text-transform: capitalize;">${newUser.firstName}</span>!</p>
        <p>Thank you for choosing MarketPlace. Use the following OTP to complete your Sign Up procedure. This OTP is valid for 5 minutes.</p>
        <div style="display: flex; align-items: center; justify-content: center; width: 100%;">
            <div style="background: #5AB2FF; color: white; width: fit-content; border-radius: 3px; padding: 5px 10px; font-size: 1.4em;">${otp}</div>
        </div>
      
        <p>Regards,</p>
        <p>MarketPlace</p>
                                   </div>`;

                        await sendMail(newUser.email, 'Verify your email', msg);
                        return res.status(201).json({ status: "success", message: `Please verify your email using the OTP sent to ${newUser.email}` });
                    } catch (error) {
                        return res.status(500).json({ status: "failed", message: "Server error. Please try again later." });
                    }
                }
            } else {
                return res.status(400).json({ status: "failed", message: "All fields are required" });
            }
        }
    }

    static verifyOtp = async (req, res) => {

        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ status: "failed", message: "Email and OTP are required" });
        }

        try {
            const user = await userModel.findOne({ email: email });
            if (!user) {
                return res.status(400).json({ status: "failed", message: "User not found" });
            }
            if (user.otp !== otp) {
                return res.status(400).json({ status: "failed", message: "Invalid OTP" });
            }
            if (Date.now() > user.otpExpiry) {
                return res.status(400).json({ status: "failed", message: "OTP expired" });
            }

            await userModel.updateOne(
                { email },
                {
                    $unset: { otp: "", otpExpiry: "" },
                    $set: { isVerified: 1 }
                }
            );

            return res.status(200).json({ status: "success", message: "Email verified successfully. Please login now." });
        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error. Please try again later." });
        }
    }

    static deleteUser = async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ status: "failed", message: "Email and password are required" });
            }
            const user = await userModel.findOne({ email: email });
            if (!user) {
                return res.status(404).json({ status: "failed", message: "User not found" });
            }
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ status: "failed", message: "Invalid password" });
            }
            if (user.image) {
                const imageId = user.image.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(`SaiClasses/Profiles/${imageId}`);
            }
            await userModel.deleteOne({ _id: user._id });
            return res.status(200).json({ status: "success", message: "User deleted successfully" });

        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error. Please try again later." });
        }
    }

    static userLogin = async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ success: false, errors: errors.array() });
            }
            const { email, password } = req.body;
            if (email && password) {
                const user = await userModel.findOne({ email: email });
                if (user !== null) {
                    const isMatch = await bcrypt.compare(password, user.password);
                    if ((user.email === email) && isMatch) {
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
                            isVerified: user.isVerified
                        };
                        return res.status(200).json({ status: "success", message: "User logged in successfully", token: token, user: userResponse });
                    } else {
                        return res.status(400).json({ status: "failed", message: "Email or password is incorrect" });
                    }
                } else {
                    return res.status(400).json({ status: "failed", message: `User with email ${email} not found` });
                }
            } else {
                res.status(400).json({ status: "failed", message: "All fields are required" });
            }
        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error. Please try again later." });
        }
    }

    static userLogout = async (req, res) => {
        try {
            return res.status(200).json({ status: "success", message: "User logged out successfully" });
        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error. Please try again later." });
        }
    }

    static userProfileUpdate = async (req, res) => {
        try {
            const { firstName, lastName, classOp, subjects } = req.body;
            let newImageUrl = null;
            let oldImagePublicId = null;

            const user = await userModel.findById(req.user._id);
            if (!user) {
                return res.status(404).json({ status: "failed", message: "User not found" });
            }

            if (req.file) {
                newImageUrl = await uploadToCloudinary(req.file.buffer);
                if (user.image) {
                    oldImagePublicId = user.image.split('/').pop().split('.')[0];
                }
            }

            const updateData = { firstName, lastName, classOp, subjects };
            if (newImageUrl) {
                updateData.image = newImageUrl;
            }

            const updatedUser = await userModel.findByIdAndUpdate(req.user._id, { $set: updateData }, { new: true });
            if (updatedUser) {
                if (oldImagePublicId) {
                    await cloudinary.uploader.destroy(`SaiClasses/Profiles/${oldImagePublicId}`, (error, result) => {
                        if (error) {
                            console.error('Error deleting old image from Cloudinary:', error);
                        } else {
                            console.log('Old image deleted from Cloudinary:', result);
                        }
                    });
                }
                return res.status(200).json({ status: "success", message: "User profile updated successfully", user: updatedUser });
            } else {
                return res.status(404).json({ status: "failed", message: "User not found" });
            }
        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error. Please try again later." });
        }
    }

    //stream videos

    static uploadVideo = async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        const { classOp, subject, videoLink } = req.body;
        try {
            const newVideo = new videoModel({ classOp, subject, videoLink });
            await newVideo.save();

            return res.status(201).json({ status: "success", message: `The video has been uploaded successfully!` });
        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error. Please try again later." });
        }
    }

    static fetchVideos = async (req, res) => {

        const { page, size, classOp, subject } = req.query;
        const pageNumber = parseInt(page, 10);
        const pageSize = parseInt(size, 10);
        const userId = req.user._id;
        try {
            const user = await userModel.findById(userId);
            if (!user || !user.subscription.isActive) {
                return res.status(403).json({ status: "failed", message: "You must purchase a subscription first!" });
            }
            const filter = {};
            if (classOp) filter.classOp = classOp;
            if (subject) filter.subject = { $regex: new RegExp(subject, 'i') };

            const totalVideos = await videoModel.countDocuments(filter);
            const videos = await videoModel.find(filter).skip((pageNumber - 1) * pageSize).limit(pageSize);

            return res.status(200).json({ status: "success", totalVideos, currentPage: pageNumber, pageSize, totalPages: Math.ceil(totalVideos / pageSize), videos });
        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error. Please try again later." });
        }
    }

    //payment apis
    static buySubscription = async (req, res) => {
        const { subAmount, currency, duration } = req.body;

        try {
            //payment code would be here 
            const payment = true;
            if (payment) {
                const userId = req.user._id;
                const user = await userModel.findById(userId);
                if (!user) {
                    return res.status(404).json({ status: "failed", message: "User not found." });
                }
                const startDate = new Date();
                const endDate = new Date();
                endDate.setMonth(endDate.getMonth() + duration);

                user.subscription.isActive = true;
                user.subscription.startDate = startDate;
                user.subscription.endDate = endDate;

                await user.save();
                return res.status(200).json({ status: "success", message: "Payment is completed." });
            } else {
                return res.status(200).json({ status: "success", message: "Payment is not completed!" });
            }

        } catch (error) {
            return res.status(500).json({ status: "failed", message: "Server error. Please try again later." });
        }
    }

}

export default userCont;