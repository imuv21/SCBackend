import { check, body } from "express-validator";

const signupValidator = [
    check("firstName").not().isEmpty()
        .withMessage("First name is required"),
    check("lastName").not().isEmpty()
        .withMessage("Last name is required"),
    check("email").isEmail()
        .normalizeEmail({
            gmail_remove_dots: true
        }).withMessage("Invalid email address"),
    check("password").isStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1
    }).withMessage("Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character"),
    body("confirmPassword").custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error("Passwords do not match");
        }
        return true;
    }),
    check("classOp").not().isEmpty()
        .withMessage("Class is required"),
    check("subjects").isArray({ min: 1 })
        .withMessage("Choose at least one subject")
];

const loginValidator = [
    check("email").isEmail()
        .normalizeEmail({
            gmail_remove_dots: true
        }).withMessage("Invalid email address"),
    check("password").isStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1
    }).withMessage("Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character")
];

const videoValidator = [

    check("classOp").not().isEmpty().withMessage("Class is required").isNumeric().withMessage("Class must be a number"),

    check("subject").not().isEmpty().withMessage("Subject is required"),

    check("videoLink").not().isEmpty().withMessage("Video link is required").isURL().withMessage("Video link must be a valid URL"),
];

export { signupValidator, loginValidator, videoValidator };