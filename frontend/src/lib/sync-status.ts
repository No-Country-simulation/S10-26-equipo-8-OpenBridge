// Mock: el contrato v1 solo expone `lastSyncedAt` en el detalle (GET /repositories/:id),
// no en el listado. Se reemplaza cuando backend defina de dónde sale.
export async function getLastSyncedAt() {
  return new Date(Date.now() - 3 * 3_600_000).toISOString();
}
