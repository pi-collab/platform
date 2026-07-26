/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  corePlugins: {
    preflight: false, // preserve existing vanilla-CSS styles
  },
  theme: {
    extend: {
      colors: {
        // ---- Brand / primary (neon). Reserved: 1 CTA, mascot, celebration ----
        brand:        { DEFAULT: '#E8FF66', hover: '#EEFF7A', active: '#DDF95A', deep: '#D2F04A' },

        // ---- Secondary = frosted glass (translucent, not a solid) ----
        frost:        { DEFAULT: 'rgba(255,255,255,0.55)', strong: 'rgba(255,255,255,0.72)',
                        soft: 'rgba(255,255,255,0.50)', edge: 'rgba(255,255,255,0.85)' },

        // ---- Backgrounds / page wash ----
        page:         { DEFAULT: '#FAFBFD', 2: '#F4F7FC', 3: '#F7F4FC' },

        // ---- Surface / card (glass fills are gradients, see boxShadow/util) ----
        surface:      { DEFAULT: 'rgba(255,255,255,0.55)', strong: 'rgba(255,255,255,0.72)' },

        // ---- Text ----
        ink:          { DEFAULT: '#181C24', soft: '#4A4F58', faint: '#8B90A0' },

        // ---- Borders ----
        border:       { DEFAULT: 'rgba(255,255,255,0.85)',      // bright specular edge
                        hairline: 'rgba(120,130,150,0.22)' },   // divider on light

        // ---- Semantic (used only in tags/dots/alerts, never as page fills) ----
        success:      { DEFAULT: '#1F9D6B', text: '#1F8A5B', soft: '#ECFBF5' },
        info:         { DEFAULT: '#5AA9E6', text: '#2C7CC4', soft: '#F0FAFF' },
        warning:      { DEFAULT: '#D89A2E', text: '#A9761D', soft: '#FFFEF3' },
        danger:       { DEFAULT: '#D2545A', text: '#9B3030', soft: '#FFEBEB' },

        // ---- Atmospheric pastels (one owns each scene; never 3+ per viewport) ----
        sky: '#EEF6FD', 'sky-mist': '#F0FAFF', lavender: '#F4F0FF', orchid: '#FAEEFF',
        mint: '#ECFBF5', butter: '#FFFEF3', peach: '#FFF3EC', coral: '#FFEBEB', blush: '#FFF7FA',
      },

      fontFamily: {
        display: ['var(--font-sora)', 'system-ui', 'sans-serif'],
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        // [size, { lineHeight, letterSpacing, fontWeight }]
        'display': ['96px', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '800' }],
        'h1':      ['72px', { lineHeight: '1.1',  letterSpacing: '-0.03em', fontWeight: '700' }],
        'h2':      ['56px', { lineHeight: '1.2',  letterSpacing: '-0.02em', fontWeight: '700' }],
        'h3':      ['40px', { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '600' }],
        'h4':      ['32px', { lineHeight: '1.3',  letterSpacing: '-0.02em', fontWeight: '600' }],
        'h5':      ['21px', { lineHeight: '1.3',  fontWeight: '600' }],
        'lg':      ['18px', { lineHeight: '1.55', fontWeight: '400' }],
        'body':    ['16px', { lineHeight: '1.6',  fontWeight: '400' }],
        'small':   ['14px', { lineHeight: '1.55', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.4',  fontWeight: '500' }],
        'eyebrow': ['11px', { lineHeight: '1.4',  letterSpacing: '0.22em', fontWeight: '600' }],
      },

      spacing: {
        1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px',
        8: '32px', 12: '48px', 16: '64px', 24: '96px',
      },

      borderRadius: {
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
        pill: '9999px',
        DEFAULT: '24px',
      },

      boxShadow: {
        soft:  '0 24px 60px -28px rgba(40,52,70,0.28)',
        glass: '0 8px 32px -12px rgba(60,70,100,0.22), inset 0 1px 1px rgba(255,255,255,0.6)',
        neon:  '0 12px 28px -8px rgba(180,210,20,0.6), inset 0 1px 2px rgba(255,255,255,0.5)',
        lift:  '0 30px 60px -24px rgba(90,120,180,0.28)',
        none:  'none',
      },

      backdropBlur: { glass: '22px', 'glass-soft': '16px', nav: '20px' },

      transitionTimingFunction: {
        out:   'cubic-bezier(.22,1,.36,1)',
        spring:'cubic-bezier(.34,1.56,.64,1)',
        back:  'cubic-bezier(.68,-0.4,.32,1.4)',
      },
      transitionDuration: {
        hover: '200ms', click: '150ms', modal: '350ms', page: '500ms',
      },
    },
  },
  plugins: [],
};
