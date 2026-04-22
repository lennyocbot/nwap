/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Inter', 'system-ui', 'sans-serif'],
        body: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#f7f7f8',
          100: '#eeeef1',
          200: '#d9d9e0',
          300: '#b8b8c4',
          400: '#8f8fa0',
          500: '#6d6d7e',
          600: '#525263',
          700: '#3e3e4d',
          800: '#2a2a38',
          900: '#1a1a24',
          950: '#0f0f18',
        },
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd3ff',
          300: '#8eb5ff',
          400: '#5a8cff',
          500: '#3566ff',
          600: '#2147f5',
          700: '#1a37d4',
          800: '#1b31a8',
          900: '#1d2f85',
        },
        accent: {
          violet: '#8b5cf6',
          pink: '#ec4899',
          teal: '#14b8a6',
          amber: '#f59e0b',
          emerald: '#10b981',
          rose: '#f43f5e',
          sky: '#0ea5e9',
        }
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
        pop: '0 10px 40px -10px rgba(53,102,255,0.35)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-up': 'slideUp 250ms cubic-bezier(.2,.8,.2,1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' }
        },
        pulseSoft: {
          '0%,100%': { opacity: 1 },
          '50%': { opacity: 0.6 }
        }
      }
    },
  },
  plugins: [],
}
