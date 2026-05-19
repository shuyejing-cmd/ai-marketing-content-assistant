import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1f2328',
        muted: '#69717d',
        line: '#d8dee8',
        canvas: '#f7f5f0',
        surface: '#ffffff',
        accent: '#0f7f6c',
        warm: '#d9552f',
      },
      boxShadow: {
        soft: '0 10px 30px rgba(31, 35, 40, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
