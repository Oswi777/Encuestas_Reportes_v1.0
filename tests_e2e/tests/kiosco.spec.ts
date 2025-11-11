import { test, expect } from '@playwright/test';

// Apps a validar
const apps = [
  { path: '/comedor',     pregunta: /servicio de comedor/i,     pos: ['Excelente','Bueno'], neg: ['Regular','Malo'] },
  { path: '/transporte',  pregunta: /servicio de transporte/i,  pos: ['Excelente','Bueno'], neg: ['Regular','Malo'] }
] as const;

// Helper: adjunta captura al reporte HTML
async function snap(page, name: string, testInfo: any) {
  const buf = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { body: buf, contentType: 'image/png' });
}

// Localizadores robustos para inputs del flujo "Otro"
async function getEmpleadoInput(page) {
  const cand = [
    page.getByLabel(/empleado/i),
    page.getByPlaceholder(/empleado/i),
    page.locator('input[name=empleado]'),
    page.locator('input[id*="empleado" i]'),
    page.locator('input[type=tel]'),
    page.locator('input[type=number]')
  ];
  for (const c of cand) {
    const el = c.first();
    if (await el.isVisible().catch(() => false)) return el;
  }
  return cand[0].first();
}

async function getComentarioInput(page) {
  const cand = [
    page.getByLabel(/comentario/i),
    page.getByPlaceholder(/comentario/i),
    page.locator('textarea[name=comentario]'),
    page.locator('textarea[id*="comentario" i]'),
    page.locator('textarea')
  ];
  for (const c of cand) {
    const el = c.first();
    if (await el.isVisible().catch(() => false)) return el;
  }
  return cand[0].first();
}

for (const app of apps) {
  test.describe(`Kiosco ${app.path}`, () => {

    test(`Carga pantalla principal y botones`, async ({ page }, testInfo) => {
      await page.goto(app.path);
      await snap(page, '01-visit', testInfo);

      await expect(page.getByText(app.pregunta)).toBeVisible();
      for (const b of ['Excelente','Bueno','Regular','Malo']) {
        await expect(page.getByRole('button', { name: b })).toBeVisible();
      }
      await snap(page, '02-main-buttons', testInfo);
    });

    test(`Flujo feliz con motivo normal (positivo)`, async ({ page }, testInfo) => {
      await page.goto(app.path);
      await snap(page, '01-main', testInfo);

      await page.getByRole('button', { name: app.pos[0] }).click();
      await snap(page, '02-motivos', testInfo);

      // Clic al primer motivo distinto de "Otro"
      const secundarios = page.locator('button.boton-grande');
      const n = await secundarios.count();
      let clicked = false;
      for (let i = 0; i < n; i++) {
        const el = secundarios.nth(i);
        const txt = (await el.innerText()).trim();
        if (!/^otro$/i.test(txt)) {
          await el.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        await page.getByRole('button', { name: /^otro$/i }).click().catch(()=>{});
      }
      await snap(page, '03-gracias', testInfo);
      await expect(page.getByText(/gracias por tu opinión/i)).toBeVisible();
    });

    test(`Flujo "Otro": Enter→Enter (empleado y comentario)`, async ({ page }, testInfo) => {
      await page.goto(app.path);
      await snap(page, '01-main', testInfo);

      // Elegimos una calificación negativa para asegurar que exista "Otro"
      await page.getByRole('button', { name: app.neg[0] }).click();
      await snap(page, '02-secundarios', testInfo);

      await page.getByRole('button', { name: /^otro$/i }).click();
      await snap(page, '03-otro-modal', testInfo);

      const empleado = await getEmpleadoInput(page);
      await empleado.fill('12345');
      await snap(page, '04-otro-empleado', testInfo);
      await empleado.press('Enter');

      const comentario = await getComentarioInput(page);
      await expect(comentario).toBeFocused();
      await comentario.fill('Comentario E2E: flujo Otro');
      await snap(page, '05-otro-comentario', testInfo);
      await comentario.press('Enter');

      // Debe salir "Gracias" y luego volver a Home
      await expect(page.getByText(/gracias por tu opinión/i)).toBeVisible();
      await snap(page, '06-gracias', testInfo);

      // En ≤ 4s deben reaparecer los botones principales
      await expect(page.getByRole('button', { name: 'Excelente' })).toBeVisible({ timeout: 4000 });
      await snap(page, '07-home-reset', testInfo);
    });

    test(`Cola offline básica y reconexión`, async ({ page, context }, testInfo) => {
      await page.goto(app.path);
      await snap(page, '01-main', testInfo);

      await context.setOffline(true);
      await page.getByRole('button', { name: 'Excelente' }).click();
      await snap(page, '02-secundarios-off', testInfo);

      const secundarios = page.locator('button.boton-grande');
      await secundarios.first().click();
      await snap(page, '03-gracias-off', testInfo);
      await expect(page.getByText(/gracias/i)).toBeVisible();

      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await snap(page, '04-reonline', testInfo);

      await expect(page.getByRole('button', { name: 'Excelente' })).toBeVisible({ timeout: 4000 });
      await snap(page, '05-home', testInfo);
    });

  });
}
