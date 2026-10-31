import { isDBConnected } from '../config/db.js'
import { pingAudioService } from '../services/audioService.js'

export async function getHealth(req, res) {
  const audioUp = await pingAudioService()
  res.json({
    server: 'ok',
    database: isDBConnected() ? 'ok' : 'down',
    audioService: audioUp ? 'ok' : 'down',
  })
}
