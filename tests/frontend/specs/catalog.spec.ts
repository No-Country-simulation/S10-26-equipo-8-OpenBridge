import { test, expect } from '@playwright/test';

test.describe('OpenBridge - Catálogo Frontend', () => {
  test('CAT-001 - Permite acceder al catálogo desde Home', async ({ page }) => {
    await page.goto('/');

    await page
      .getByRole('link', {
        name: 'Catálogo',
        exact: true,
      })
      .click();

    await expect(page).toHaveURL(/catalogo/);

    await expect(page.getByRole('group', { name: 'Filtros' })).toBeVisible();
  });

  test('CAT-003 - Permite filtrar herramientas por categoría', async ({ page }) => {
    await page.goto('/catalogo');

    const filters = page.getByRole('group', {
      name: 'Filtros',
    });

    // Seleccionamos la categoría desde su elemento visible.
    await filters
      .getByText('Analítica', {
        exact: true,
      })
      .click();

    // Validamos que el checkbox haya quedado seleccionado.
    await expect(
      filters.getByRole('checkbox', {
        name: 'Analítica',
      }),
    ).toBeChecked();

    // Validamos que la URL refleje el filtro.
    await expect(page).toHaveURL(/category=analytics/);
  });

  test('CAT-005 - Se visualizan correctamente las tarjetas del catálogo', async ({ page }) => {
    await page.goto('/catalogo');

    const repositoryCard = page.getByRole('link', {
      name: /tensorflow\/tensorflow/i,
    });

    await expect(repositoryCard).toBeVisible();
    await expect(repositoryCard).toContainText('tensorflow/tensorflow');
  });
});
