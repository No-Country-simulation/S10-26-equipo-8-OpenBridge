
import { test, expect } from '@playwright/test';

test.describe('OpenBridge - Buscador Frontend', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Buscar herramientas' }).click();
  });

  test('PAN-002 - Búsqueda debe traer resultados coincidentes', async ({ page }) => {
  const searchbox = page.getByRole('searchbox', { name: 'Buscar herramientas' });

  await searchbox.fill('postgres');
  await searchbox.press('Enter');

  await expect(
    page.getByRole('link', { name: /supabase\/postgres/i })
  ).toBeVisible();
});

test('PAN-003 - Búsqueda sin distinción entre mayúsculas y minúsculas', async ({ page }) => {
  const searchbox = page.getByRole('searchbox', { name: 'Buscar herramientas' });

  await searchbox.fill('POSTGRES');
  await searchbox.press('Enter');

  await expect(
    page.getByRole('link', { name: /supabase\/postgres/i })
  ).toBeVisible();
});

  test('PAN-004 - Búsqueda sin distinción de tildes', async ({ page }) => {
    const searchbox = page.getByRole('searchbox', { name: 'Buscar herramientas' });

    await searchbox.fill('analitica');

    await expect(
      page.getByRole('link', { name: /Analítica/i })
    ).toBeVisible();
  });

    test('PAN-005 - Mensaje cuando no existen resultados', async ({ page }) => {
    const searchbox = page.getByRole('searchbox', { name: 'Buscar herramientas' });

    await searchbox.fill('xyzprueba987654');

    
  });

});
