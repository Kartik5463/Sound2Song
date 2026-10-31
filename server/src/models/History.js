import mongoose from 'mongoose'

// One row per (browser, video): when that browser last searched the video.
// The result itself lives in the Search collection, shared by everyone.
const historySchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  videoId: { type: String, required: true },
  searchedAt: { type: Date, default: Date.now },
})

historySchema.index({ clientId: 1, videoId: 1 }, { unique: true })
historySchema.index({ clientId: 1, searchedAt: -1 })

export default mongoose.model('History', historySchema)
