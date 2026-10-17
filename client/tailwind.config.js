export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#101c35',
        muted: '#6c7b91',
        line: '#e8edf3',
        canvas: '#f5f7fb',
        brand: '#4169e1',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui'] },
      boxShadow: { soft: '0 8px 30px rgba(16,28,53,.05)' },
    },
  },
  plugins: [],
};
