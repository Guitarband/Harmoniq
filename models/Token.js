const mongoose = require('mongoose')

const tokenSchema = new mongoose.Schema({
    discordId: {
        type: String,
        required: true,
        unique: true
    },
    accessToken: {
        type: String,
        required: true
    },
    refreshToken: {
        type: String,
        required: true
    },
    expiresIn: {
        type: Number,
        required: true
    },
    retrievedAt: {
        type: Date,
        required: true
    }
})

module.exports = mongoose.model('Token', tokenSchema, 'connectedUsers')