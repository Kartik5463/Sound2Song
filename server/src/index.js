import app from './app.js'
import { env } from './config/env.js'
import { connectDB } from './config/db.js'

// Start accepting requests right away; the database connects in the background
app.listen(env.port, () => {
  console.log(`[server] API running on http://localhost:${env.port}`)
})

connectDB()
