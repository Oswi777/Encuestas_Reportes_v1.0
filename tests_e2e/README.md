# tests_e2e — Playwright para Kioscos (Comedor y Transporte)

Este paquete ejecuta pruebas E2E directamente contra tu despliegue en Render:
**https://encuestas-reportes.onrender.com**

Incluye:
- `playwright.config.ts` con `baseURL` a producción, capturas **siempre**, video y trazas.
- `tests/kiosco.spec.ts` con flujos:
  - Carga de pantalla principal.
  - Flujo feliz de calificación con motivo normal.
  - Flujo **"Otro"**: Enter en *empleado* → Enter en *comentario* → **¡Gracias!**.
  - Prueba de cola **offline** y reconexión.
- Reporte HTML al finalizar.

## Instalación
```bash
cd tests_e2e
npm install
npx playwright install --with-deps
```

## Ejecutar pruebas
```bash
npx playwright test
```

- Para ver el reporte HTML: `npx playwright show-report`
- Para ver el modo UI: `npx playwright test --ui`
- Para ver el navegador: `npm run test:headed`

## Cambiar la URL base (opcional)
Por defecto apunta a producción. Puedes apuntar a local así:
```bash
BASE_URL=http://localhost:8000 npx playwright test
```

## Evidencia automática
- **Capturas**: se adjuntan a cada test en el reporte HTML (gracias a `screenshot: 'on'` y a `snap()`).
- **Video**: se graba para todos los tests (`video: 'on'`).
- **Trace**: se genera traza con capturas de cada paso (`trace: 'on'`).

## Notas de selectores
Los inputs del flujo “Otro” se localizan por *label* o *placeholder*. Si tienes IDs fijos,
puedes cambiar en `tests/kiosco.spec.ts` los localizadores por `#empleado` y `#comentario` para mayor precisión.
