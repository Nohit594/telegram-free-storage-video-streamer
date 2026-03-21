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
    required: false,
  },
  playlistMessageId: {
    type: Number,
    required: false,
  },
  chunks: [{
    name: String,
    fileId: String,
    messageId: Number,
  }],
  storageProvider: {
    type: String,
    enum: ['telegram'],
    default: 'telegram',
  },
  assets: [{
    path: String,
    fileId: String,
    messageId: Number,
    size: Number,
  }],
  masterPlaylistPath: {
    type: String,
    default: 'master.m3u8',
  },
  variants: [{
    index: Number,
    name: String,
    width: Number,
    height: Number,
    videoBitrate: String,
    audioBitrate: String,
    bandwidth: Number,
    playlistPath: String,
  }],
  availableQualities: [String],
  durationSeconds: Number,
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
