
import { test, expect } from '@playwright/test';

test.describe('OpenBridge - Navegación del buscador', () => {

  test('NAV-003 - Permite buscar resultados mediante ENTER', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', {
      name: 'Buscar herramientas'
    }).click();

    const searchbox = page.getByRole('searchbox', {
      name: 'Buscar herramientas'
    });

    await searchbox.fill('postgres');
    await searchbox.press('Enter');

    await expect(
      page.getByRole('link', {
        name: /supabase\/postgres/i
      })
    ).toBeVisible();
  });

  test('NAV-001 - Permite navegar al seleccionar un resultado', async ({ page }) => {
    await page.goto('/');

    const homeUrl = page.url();

    await page.getByRole('button', {
      name: 'Buscar herramientas'
    }).click();

    const searchbox = page.getByRole('searchbox', {
      name: 'Buscar herramientas'
    });

    await searchbox.fill('postgres');
    await searchbox.press('Enter');

    const result = page.getByRole('link', {
      name: /supabase\/postgres/i
    });

    await expect(result).toBeVisible();
    await result.click();

    await expect(page).not.toHaveURL(homeUrl);

    await page.getByRole('link', {
      name: 'OpenBridge'
    }).click();

    await expect(page).toHaveURL(homeUrl);
  });

  test('NAV-004 - Permite cerrar el panel mediante Escape', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', {
    name: 'Buscar herramientas'
  }).click();

  const searchbox = page.getByRole('searchbox', {
    name: 'Buscar herramientas'
  });

  await searchbox.fill('postgres');

  await searchbox.press('Escape');

  await expect(searchbox).not.toBeVisible();
});

});
