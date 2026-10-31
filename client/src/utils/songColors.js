// One colour per song, used on the timeline and the song cards so they can be matched up
const PALETTE = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#2dd4bf']

/** Map each song key to a colour, in order of appearance. */
export function songColorMap(songs = []) {
  return Object.fromEntries(songs.map((s, i) => [s.key, PALETTE[i % PALETTE.length]]))
}
