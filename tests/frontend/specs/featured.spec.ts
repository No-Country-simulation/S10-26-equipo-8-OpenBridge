import { test, expect } from '@playwright/test';

test.describe('OpenBridge - Destacados Frontend', () => {
  test('DEST-001 - Se visualiza correctamente la sección Destacados', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Destacados', { exact: true }).first()).toBeVisible();
  });

  test('DEST-002 - Se muestran exactamente 6 herramientas destacadas', async ({ page }) => {
    await page.goto('/');

    const featuredTools = page.getByRole('link', {
      name: /Activo/,
    });

    await expect(featuredTools).toHaveCount(6);
  });

  test('DEST-004 - Permite navegar al seleccionar una herramienta destacada', async ({ page }) => {
    await page.goto('/');

    const homeUrl = page.url();

    const featuredTool = page.getByRole('link', {
      name: 'tensorflow/tensorflow Activo',
    });

    await expect(featuredTool).toBeVisible();

    await featuredTool.click();

    await expect(page).not.toHaveURL(homeUrl);

    await page
      .getByRole('link', {
        name: 'OpenBridge',
      })
      .click();

    await expect(page).toHaveURL(homeUrl);
  });
});
