/**
 * Play a short "guap" notification sound using Web Audio API.
 * Two-tone chime: subtle, pleasant, ~200ms total.
 * Fails silently if audio is blocked by the browser.
 */
export function playGuapSound() {
  try {
    const ctx = new AudioContext()

    // First tone — slightly higher
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.value = 880 // A5
    gain1.gain.setValueAtTime(0.15, ctx.currentTime)
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.12)

    // Second tone — resolving note, slightly delayed
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.value = 1175 // D6
    gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.08)
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(ctx.currentTime + 0.08)
    osc2.stop(ctx.currentTime + 0.22)

    // Clean up context after sound finishes
    setTimeout(() => ctx.close(), 300)
  } catch {
    // AudioContext blocked or unavailable — fail silently
  }
}
