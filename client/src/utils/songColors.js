// One colour per song, used on the timeline and the song cards so they can be matched up.
// Earthy tones that stay readable on the cream background.
const PALETTE = ['#b0703c', '#3f8f8a', '#8e4f7a', '#6f8f4e', '#c0583f', '#4f6d9a', '#c79a2a', '#a0525c']

/** Map each song key to a colour, in order of appearance. */
export function songColorMap(songs = []) {
  return Object.fromEntries(songs.map((s, i) => [s.key, PALETTE[i % PALETTE.length]]))
}
