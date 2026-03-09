import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/MiniGames/',
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main:           resolve('index.html'),
        curveSelector:  resolve('games/curve-selector/index.html'),
        ballToGoal:     resolve('games/ball-to-goal/index.html'),
        balancingGame:  resolve('games/balancing-game/index.html'),
        stackTheOrder:  resolve('games/stack-the-order/index.html'),
        sortingGame:    resolve('games/sorting-game/index.html'),
        memoryGame:     resolve('games/memory-game/index.html'),
      },
    },
  },
});
