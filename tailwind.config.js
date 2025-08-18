
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        'copy-pop': { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.03)' } }
      },
      animation: { 'copy-pop': 'copy-pop 250ms ease-out' },
      colors: { accent: '#00c16a', ink: '#0f172a' },
      boxShadow: { soft: '0 10px 25px rgba(0,0,0,0.05)' },
      borderRadius: { '2xl': '1rem' }
    }
  }
}
