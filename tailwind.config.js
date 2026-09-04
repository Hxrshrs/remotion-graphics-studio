/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#121212',
        surface: {
          DEFAULT: '#181818',
          raised: '#202020',
          active: '#282828',
          hover: '#242424',
        },
        muted: {
          DEFAULT: '#242424',
          foreground: '#888888',
          dim: '#555555',
        },
        accent: {
          DEFAULT: '#ffffff',
          hover: '#e5e5e5',
          subtle: 'rgba(255, 255, 255, 0.08)',
        },
        primary: {
          DEFAULT: '#f5f5f5',
          foreground: '#121212',
        },
        danger: '#e05252',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
