import mongoose from "mongoose";

const classOptions = [6, 7, 8, 9, 10];

const paymentHistorySchema = new mongoose.Schema({
    paidAmount: {
        type: Number,
        required: true,
    },
    duration: {
        type: Number, 
        required: true,
    },
    paymentDate: {
        type: Date,
        default: Date.now, 
    },
    razorpay_order_id: {
        type: String,
        required: true,
    },
    razorpay_payment_id: {
        type: String,
        required: true,
    },
    razorpay_signature: {
        type: String,
        required: true,
    }
});

//Subscription schema
const subscriptionSchema = new mongoose.Schema({
    subAmount: {
        type: Number,
        required: true,
    },
    isActive: {
        type: Boolean,
        default: false,
    },
    startDate: {
        type: Date,
    },
    endDate: {
        type: Date,
    },
    paymentHistory: [{
        type: paymentHistorySchema,
    }]
});

//Video schema
const videoSchema = new mongoose.Schema({
    classOp: {
        type: Number,
        required: true,
    },
    subject: {
        type: String,
        required: true,
        trim: true,
    },
    publicId: {
        type: String,
        required: true,
        trim: true,
    }
});

//User schema
const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
        trim: true,
    },
    lastName: {
        type: String,
        required: true,
        trim: true,
    },
    classOp: {
        type: Number,
        required: true,
        enum: classOptions,
        default: 6,
    },
    subjects: {
        type: [String],
        required: true,
        default: [],
    },
    email: {
        type: String,
        required: true,
        trim: true,
    },
    password: {
        type: String,
        required: true,
        trim: true,
    },
    image: {
        type: String,
        trim: true,
    },
    otp: {
        type: String,
        trim: true,
    },
    otpExpiry: {
        type: Date,
    },
    isVerified: {
        type: Number,
        default: 0,
    },
    subscription: subscriptionSchema
});

//Composite index on email
userSchema.index({ email: 1 }, { unique: true });

//Model
const userModel = mongoose.model("User", userSchema);
const videoModel = mongoose.model("Videos", videoSchema);
export { userModel, videoModel };


// const notificationSchema = new mongoose.Schema({
//     type: {
//         type: String,
//         required: true,
//     },
//     from: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'user',
//         required: true,
//     },
//     createdAt: {
//         type: Date,
//         default: Date.now,
//     },
// });
// const messageSchema = new mongoose.Schema({
//     sender: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'user',
//         required: true,
//     },
//     receiver: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'user',
//         required: true,
//     },
//     content: {
//         type: String,
//         required: true,
//     },
//     timestamp: {
//         type: Date,
//         default: Date.now,
//     }
// });
// notifications: [{
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Notification',
// }],
// messages: [{
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Message',
// }],
// const notificationModel = mongoose.model("Notification", notificationSchema);
// const messageModel = mongoose.model("Message", messageSchema);