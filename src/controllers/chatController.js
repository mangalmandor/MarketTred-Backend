const Message = require('../models/Message');
const User = require('../models/User');
const { sendRealTimeMessage } = require('../services/socketService');
const { sendEmailAlert } = require('../services/emailService');

const sendMessage = async (req, res) => {
    const { receiverId, content, productId } = req.body;
    const senderId = req.user._id;

    try {
        const newMessage = await Message.create({
            sender: senderId,
            receiver: receiverId,
            product: productId,
            content
        });

        const populatedMessage = await Message.findById(newMessage._id).populate([
            { path: 'sender', select: 'name' },
            { path: 'product', select: 'title image' }
        ]);

        const socketPayload = {
            _id: populatedMessage._id,
            content: populatedMessage.content,
            sender: { _id: senderId, name: populatedMessage.sender.name },
            buyer: { _id: senderId, name: populatedMessage.sender.name },
            product: populatedMessage.product,
            lastMessage: populatedMessage.content,
            createdAt: populatedMessage.createdAt
        };

        sendRealTimeMessage(receiverId, socketPayload);

        User.findById(receiverId).then(async (receiverUser) => {
            if (receiverUser && receiverUser.email) {       
                try {
                    await sendEmailAlert({
                        to: receiverUser.email,
                        subject: 'New Inquiry for your Product',
                        text: `${populatedMessage.sender.name} sent you a message: "${content}". Login to reply.`
                    });
                } catch (e) {
                    console.error("Email delivery failed:", e.message);
                }
            }
        }).catch(err => console.error("User lookup failed:", err.message));

        res.status(201).json(populatedMessage);
    } catch (error) {
        console.error("SendMessage Error:", error);
        res.status(500).json({ error: error.message });
    }
};

const getMessages = async (req, res) => {
    const { otherUserId, productId } = req.params;
    const currentUserId = req.user._id;

    try {
        await Message.updateMany(
            {
                sender: otherUserId,
                receiver: currentUserId,
                product: productId,
                isRead: false
            },
            { $set: { isRead: true } }
        );

        const messages = await Message.find({
            product: productId,
            $or: [
                { sender: currentUserId, receiver: otherUserId },
                { sender: otherUserId, receiver: currentUserId }
            ]
        }).sort({ createdAt: 1 });

        res.status(200).json(messages);
    } catch (error) {
        console.error("GetMessages Error:", error);
        res.status(500).json({ error: error.message });
    }
};

const getConversations = async (req, res) => {
    const userId = req.user._id;

    try {
        const conversations = await Message.aggregate([
            {
                $match: { $or: [{ receiver: userId }, { sender: userId }] }
            },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: {
                        otherUser: { $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"] },
                        product: "$product"
                    },
                    lastMessage: { $first: "$content" },
                    createdAt: { $first: "$createdAt" },
                    messageId: { $first: "$_id" },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$receiver", userId] },
                                        { $eq: [{ $ifNull: ["$isRead", false] }, false] }
                                    ]
                                },
                                1, 0
                            ]
                        }
                    }
                }
            },
            {
                $lookup: { from: 'users', localField: '_id.otherUser', foreignField: '_id', as: 'userData' }
            },
            {
                $lookup: { from: 'products', localField: '_id.product', foreignField: '_id', as: 'productData' }
            },
            { $unwind: '$userData' },
            { $unwind: '$productData' },
            {
                $project: {
                    _id: "$messageId",
                    seller: { _id: "$userData._id", name: "$userData.name" },
                    buyer: { _id: "$userData._id", name: "$userData.name" },
                    product: { _id: "$productData._id", title: "$productData.title", image: "$productData.image" },
                    lastMessage: 1,
                    createdAt: 1,
                    isUnread: { $gt: ["$unreadCount", 0] }
                }
            }
        ]);

        res.status(200).json(conversations);
    } catch (error) {
        console.error("GetConversations Error:", error);
        res.status(500).json({ error: error.message });
    }
};

const deleteChat = async (req, res) => {
    const { otherUserId, productId } = req.params;
    const currentUserId = req.user._id;

    try {
        const result = await Message.deleteMany({
            product: productId,
            $or: [
                { sender: currentUserId, receiver: otherUserId },
                { sender: otherUserId, receiver: currentUserId }
            ]
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "No messages found to delete" });
        }

        res.status(200).json({
            message: "Chat history deleted successfully",
            productId,
            otherUserId
        });
    } catch (error) {
        console.error("DeleteChat Error:", error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    sendMessage,
    getMessages,
    getConversations,
    deleteChat
};