import { defineConfig, devices } from '@playwright/test';

// Base de producción por defecto. Puedes sobreescribir con: BASE_URL=http://localhost:8000 npx playwright test
const BASE = process.env.BASE_URL || 'https://encuestas-reportes.onrender.com';

export default defineConfig({
  timeout: 60000,
  expect: { timeout: 8000 },
  use: {
    baseURL: BASE,
    // Capturas y evidencia SIEMPRE
    screenshot: 'on',         // captura en cada expect() y al final de cada test
    video: 'on',              // graba video de todos los tests
    trace: 'on',              // traza con capturas de cada paso
    actionTimeout: 15000,
    navigationTimeout: 20000
  },
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'iPad Safari',    use: { ...devices['iPad (gen 7)'] } },
    { name: 'Android Chrome', use: { ...devices['Pixel 7'] } }
  ],
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ]
});
