import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f5', 100: '#d9ebe6', 200: '#b7d9d0', 300: '#86bfb1', 400: '#559e8e',
          500: '#287d6d', 600: '#186557', 700: '#145147', 800: '#123f39', 900: '#102f2c',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(19, 34, 32, 0.04)',
        hover: '0 5px 14px rgba(19, 34, 32, 0.08)',
        focus: '0 0 0 3px rgba(40, 125, 109, 0.22)',
      },
      borderRadius: {
        '3xl': '0.75rem',
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        display: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
  ],
}

export default config
