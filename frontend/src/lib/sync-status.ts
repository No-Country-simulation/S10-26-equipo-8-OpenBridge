import { isApiEnabled } from '@/lib/api';
import { getRepository, listRepositories } from '@/lib/repositories';

export type CatalogStatus = {
  // Total de repositorios del catálogo (meta.total del listado, sin contar dos veces los que
  // están en varias categorías).
  total: number;
  // Última sincronización con GitHub, o null si no se pudo saber.
  lastSyncedAt: string | null;
};

// El contrato v1 solo expone `lastSyncedAt` en el detalle (GET /repositories/:id). La ingesta diaria
// sincroniza todo el catálogo junta, así que el de cualquier repositorio sirve de referencia.
// Si la API falla, el pie de página no se cae: se muestran los datos de prueba o se omite la hora.
export async function getCatalogStatus(): Promise<CatalogStatus> {
  if (!isApiEnabled) {
    const { meta } = await listRepositories({ size: 1 });
    return { total: meta.total, lastSyncedAt: new Date(Date.now() - 3 * 3_600_000).toISOString() };
  }

  try {
    const { data, meta } = await listRepositories({ size: 1, sort: 'updated' });
    const detail = data[0] ? await getRepository(data[0].id) : null;
    return { total: meta.total, lastSyncedAt: detail?.lastSyncedAt ?? null };
  } catch {
    return { total: 0, lastSyncedAt: null };
  }
}
