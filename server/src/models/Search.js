import mongoose from 'mongoose'

// One identified song inside a video (a video can contain several)
const matchSchema = new mongoose.Schema(
  {
    title: String,
    artist: String,
    album: String,
    year: String,
    genre: String,
    coverUrl: String,
    confidence: Number,
    startTime: Number, // seconds into the video
    endTime: Number,
  },
  { _id: false },
)

const searchSchema = new mongoose.Schema(
  {
    videoId: { type: String, required: true, index: true },
    url: { type: String, required: true },
    videoTitle: String,
    status: { type: String, enum: ['pending', 'done', 'not_found', 'failed'], default: 'pending' },
    matches: [matchSchema],
    error: String,
  },
  { timestamps: true },
)

export default mongoose.model('Search', searchSchema)
