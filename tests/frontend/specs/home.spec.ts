
import { test, expect } from '@playwright/test';

test.describe('OpenBridge - Home Frontend', () => {

  test('HOME-001 - La página principal carga correctamente', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/OpenBridge/i);

    await expect(page.locator('body')).toBeVisible();
  });

});
test('HOME-003 - Visualización y navegación de las categorías', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('link', { name: 'Analítica 31 Métricas de' })
    ).toBeVisible();

    await page.getByRole('link', { name: 'Analítica 31 Métricas de' }).click();

    await expect(page).toHaveURL(/catalogo/);
  });