const User = require('../models/User');
const Otp = require('../models/Otp');
const { generateToken } = require('../utils/paseto');
const { sendEmailAlert } = require('../services/emailService');

const register = async (req, res) => {
    const { email } = req.body;
    try {
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ error: 'User already exists' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        await Otp.deleteMany({ email });
        await Otp.create({ email, otp });
        sendEmailAlert({
            to: email,
            subject: 'Your Registration OTP',
            text: `Your OTP for registration is: ${otp}. It is valid for 5 minutes.`
        }).catch((err) => {
            console.error('Background email failed to send:', err);
        });

        res.status(200).json({
            success: true,
            message: "OTP sent successfully! Please check your email."
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const verifyOtp = async (req, res) => {
    const { name, email, password, otp } = req.body;
    try {
        const otpRecord = await Otp.findOne({ email, otp });
        if (!otpRecord) return res.status(400).json({ error: 'Invalid or expired OTP' });

        await User.create({ name, email, password });
        await Otp.deleteMany({ email });

        res.status(201).json({ message: 'User registered successfully. Please login.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user && (await user.matchPassword(password))) {
            const token = await generateToken({ userId: user._id, role: user.role });

            return res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token
            });
        } else {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const logout = async (req, res) => {
    try {
        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Server error during logout' });
    }
};

module.exports = { register, verifyOtp, login, logout };
