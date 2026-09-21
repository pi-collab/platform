/**
 * How many reels a creator may feature on their shopfront.
 *
 * Its own module, with no server-only import, so the picker in the editor and
 * the server action that clamps the saved list read the SAME number. A client
 * copy that drifted from the server's would let someone select eight reels,
 * press save, and silently get six — with no error and no explanation of which
 * two were dropped.
 */
export const MAX_FEATURED_REELS = 6
