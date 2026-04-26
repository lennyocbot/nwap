/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Manrope', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Manrope', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#f8faff',
          100: '#eef3ff',
          200: '#dbe5fb',
          300: '#b9c8e8',
          400: '#8397c4',
          500: '#5d6f9a',
          600: '#425277',
          700: '#2e3d61',
          800: '#1e2b4c',
          900: '#142140',
          950: '#09142c',
        },
        brand: {
          50: '#f1f6ff',
          100: '#e0eaff',
          200: '#c7d8ff',
          300: '#9fbaff',
          400: '#7195fb',
          500: '#4d73f4',
          600: '#3156df',
          700: '#2542b6',
          800: '#20398f',
          900: '#1e3473',
        },
        accent: {
          violet: '#9b9df8',
          pink: '#e879b8',
          teal: '#37b9ba',
          amber: '#d99b2b',
          emerald: '#21a67a',
          rose: '#e4586d',
          sky: '#4da7e8',
        }
      },
      boxShadow: {
        card: '0 18px 55px -38px rgba(32,57,143,0.32), 0 1px 2px rgba(30,52,115,0.05)',
        pop: '0 18px 48px -18px rgba(77,115,244,0.34)',
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
