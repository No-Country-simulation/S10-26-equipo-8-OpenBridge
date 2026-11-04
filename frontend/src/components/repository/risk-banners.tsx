import { Scale, TriangleAlert } from 'lucide-react';
import { isCopyleft } from '@/components/shared/license-badge';
import { formatLastCommit, type RepositoryDetail } from '@/lib/repositories';

const base = 'flex items-start gap-2.5 rounded-md border px-4 py-3 text-[13px] leading-5';

// Avisos que el equipo técnico debe ver antes de adoptar la herramienta.
export function RiskBanners({ repository }: { repository: RepositoryDetail }) {
  const { archived, maintenanceLevel, licenseSpdx, lastCommitAt, openIssues } = repository;
  const atRisk = maintenanceLevel === 'AT_RISK';

  return (
    <>
      {archived && (
        <p
          role="alert"
          className={`${base} border-health-risk/30 bg-health-risk-tint text-health-risk`}
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          Repositorio archivado en GitHub: ya no recibe cambios. Buscá una alternativa antes de
          adoptarlo.
        </p>
      )}
      {!archived && atRisk && (
        <p
          role="alert"
          className={`${base} border-health-risk/30 bg-health-risk-tint text-health-risk`}
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          Poca actividad reciente. Último commit {formatLastCommit(lastCommitAt)} y {openIssues}{' '}
          issues abiertas. Revisá las alternativas antes de adoptarla.
        </p>
      )}
      {licenseSpdx && isCopyleft(licenseSpdx) && (
        <p
          role="note"
          className={`${base} border-health-moderate/30 bg-health-moderate-tint text-health-moderate`}
        >
          <Scale className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          {licenseSpdx}: licencia con copyleft. Si la modificás y la ofrecés como servicio, tenés
          que publicar el código. Confirmá con el cliente antes de usarla.
        </p>
      )}
    </>
  );
}
