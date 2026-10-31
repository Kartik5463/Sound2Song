import mongoose from 'mongoose'

const { Schema } = mongoose

// A time range (in seconds into the video) where a song is playing
const rangeSchema = new Schema({ start: Number, end: Number }, { _id: false })

// One identified song inside a video (a video can contain several)
const songSchema = new Schema(
  {
    key: String, // Shazam track id
    title: String,
    artist: String,
    album: String,
    label: String,
    year: String,
    genre: String,
    isrc: String,
    durationMs: Number,
    coverUrl: String,
    previewUrl: String, // 30 s audio preview
    shazamUrl: String,
    appleMusicUrl: String,
    confidence: Number, // 0-1, based on how many segments agreed
    segmentsMatched: Number,
    startTime: Number, // first appearance
    endTime: Number,
    appearances: [rangeSchema],
  },
  { _id: false },
)

// One audio segment that was sent for recognition, kept for the timeline in the UI
const segmentSchema = new Schema(
  {
    index: Number,
    start: Number,
    end: Number,
    songKey: String,
    // matched = checked and found a song, inferred = between two checks of the same song,
    // no_match / failed = checked, skipped = not checked
    status: { type: String, enum: ['matched', 'inferred', 'no_match', 'skipped', 'failed'] },
  },
  { _id: false },
)

// One document per video: the latest result, reused as a cache for repeat searches
const searchSchema = new Schema(
  {
    videoId: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    title: String,
    channel: String,
    thumbnail: String,
    duration: Number,
    status: { type: String, enum: ['done', 'not_found'], required: true },
    songs: [songSchema],
    segments: [segmentSchema],
    silence: [rangeSchema],
    timings: { type: Map, of: Number },
    searchCount: Number, // incremented on every search (no default, so it can't clash with $inc on insert)
    lastSearchedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
)

export default mongoose.model('Search', searchSchema)
