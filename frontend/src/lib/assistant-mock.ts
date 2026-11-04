import type { Proposal } from '@/lib/assistant';

// Propuesta de prueba con la forma del evento `result` (contrato v1). Los repository.id son los
// del catálogo de prueba, así cada componente enlaza a una ficha que existe.
export const mockProposal: Proposal = {
  id: 'p_mock_logistica',
  createdAt: new Date().toISOString(),
  cached: false,
  capabilities: [
    { key: 'auth', name: 'Autenticación', reason: 'Clientes empresa con SSO propio' },
    { key: 'database', name: 'Base de datos', reason: 'Pedidos y envíos con consistencia' },
    { key: 'search', name: 'Búsqueda', reason: 'Catálogo de productos con buscador rápido' },
    { key: 'payments', name: 'Pagos', reason: 'Cobros y facturación en varios países' },
    { key: 'analytics', name: 'Analítica', reason: 'Medir el embudo de compra' },
  ],
  components: [
    {
      capability: 'auth',
      repository: {
        id: 'mock-keycloak',
        fullName: 'keycloak/keycloak',
        healthScore: 88,
        licenseSpdx: 'Apache-2.0',
      },
      justification: 'SSO empresarial maduro y self-hosted, con roles por empresa.',
      integrationType: 'REST_API',
      alternative: { id: 'mock-authentik', fullName: 'goauthentik/authentik' },
    },
    {
      capability: 'database',
      repository: {
        id: 'mock-supabase',
        fullName: 'supabase/supabase',
        healthScore: 94,
        licenseSpdx: 'Apache-2.0',
      },
      justification: 'Postgres administrado con APIs, storage y realtime listos para usar.',
      integrationType: 'SDK',
    },
    {
      capability: 'search',
      repository: {
        id: 'mock-meilisearch',
        fullName: 'meilisearch/meilisearch',
        healthScore: 55,
        licenseSpdx: 'MIT',
      },
      justification: 'Búsqueda full-text rápida y tolerante a errores de tipeo.',
      integrationType: 'WEBHOOK',
    },
    {
      capability: 'payments',
      repository: {
        id: 'mock-lago',
        fullName: 'getlago/lago',
        healthScore: 76,
        licenseSpdx: 'AGPL-3.0',
      },
      justification:
        'Facturación basada en uso y suscripciones, alternativa abierta a Stripe Billing.',
      integrationType: 'REST_API',
      alternative: { id: 'mock-killbill', fullName: 'killbill/killbill' },
    },
  ],
  connections: [
    { from: 'mock-keycloak', to: 'mock-supabase', integrationType: 'SDK', source: 'CATALOG' },
    {
      from: 'mock-supabase',
      to: 'mock-meilisearch',
      integrationType: 'WEBHOOK',
      source: 'CATALOG',
    },
    {
      from: 'mock-supabase',
      to: 'mock-lago',
      integrationType: 'REST_API',
      source: 'MODEL_SUGGESTION',
    },
  ],
  gaps: [{ capability: 'analytics', message: 'Sin opción madura en el catálogo' }],
};
