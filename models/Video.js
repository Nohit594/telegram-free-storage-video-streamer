const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  filename: {
    type: String,
    required: true,
  },
  thumbnailFileId: {
    type: String,
    required: true,
  },
  thumbnailMessageId: {
    type: Number,
    required: true,
  },
  playlistFileId: {
    type: String,
    required: true,
  },
  playlistMessageId: {
    type: Number,
    required: true,
  },
  chunks: [{
    name: String,
    fileId: String,
    messageId: Number,
  }],
  uploadTime: {
    type: Date,
    default: Date.now,
  },
  originalSize: {
    type: Number,
    required: true,
  },
  isPublic: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Video', videoSchema);
