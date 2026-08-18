/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'rep-orange': '#de5f21',
        'rep-gold': '#fea000',
        'rep-navy': '#1a2744',
        'rep-red': '#ce5447',
        'rep-bg': '#f7f4f0',
      },
      fontFamily: {
        heading: ['Quicksand', 'sans-serif'],
        body: ['"Open Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
