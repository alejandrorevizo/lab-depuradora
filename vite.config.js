import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: { echarts: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers', 'echarts/features'] },
      },
    },
  },
});
