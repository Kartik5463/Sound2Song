import axios from 'axios'

// Free, no API key. Fills gaps Shazam leaves (track length, Apple Music link, artwork).
const itunes = axios.create({ baseURL: 'https://itunes.apple.com', timeout: 3000 })

const normalize = (s = '') =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '') // drop "(feat. X)", "[Remix]" etc.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Pick the iTunes result whose title and artist best match the Shazam song. */
function bestMatch(results, song) {
  const title = normalize(song.title)
  const artist = normalize(song.artist)
  let best = null
  let bestScore = 0
  for (const r of results) {
    const t = normalize(r.trackName)
    const a = normalize(r.artistName)
    let score = 0
    if (t === title) score += 2
    else if (t.includes(title) || title.includes(t)) score += 1
    if (a === artist) score += 2
    else if (a.includes(artist) || artist.includes(a)) score += 1
    if (score > bestScore) {
      best = r
      bestScore = score
    }
  }
  // Require at least a partial title match and a partial artist match
  return bestScore >= 2 ? best : null
}

async function lookupItunes(song) {
  if (!song.title || !song.artist) return null
  const { data } = await itunes.get('/search', {
    params: { term: `${song.title} ${song.artist}`, entity: 'song', limit: 10 },
  })
  return bestMatch(data.results ?? [], song)
}

/** Add iTunes details to a song. Never throws: on any failure the song is returned as is. */
export async function enrichSong(song) {
  try {
    const match = await lookupItunes(song)
    if (!match) return song
    return {
      ...song,
      durationMs: match.trackTimeMillis ?? song.durationMs,
      appleMusicUrl: match.trackViewUrl ?? song.appleMusicUrl,
      album: song.album || match.collectionName,
      genre: song.genre || match.primaryGenreName,
      year: song.year || match.releaseDate?.slice(0, 4),
      previewUrl: song.previewUrl || match.previewUrl,
      coverUrl: song.coverUrl || match.artworkUrl100?.replace('100x100', '600x600'),
    }
  } catch (err) {
    console.warn(`[metadata] iTunes lookup failed for "${song.title}": ${err.message}`)
    return song
  }
}

export const enrichSongs = (songs) => Promise.all(songs.map(enrichSong))
