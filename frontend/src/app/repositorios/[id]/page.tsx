import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { IntegrationIdeas } from '@/components/repository/integration-ideas';
import { RepositoryHeader } from '@/components/repository/repository-header';
import {
  HealthPanel,
  LicensePanel,
  MetricsPanel,
  TopicsPanel,
} from '@/components/repository/repository-panels';
import { RiskBanners } from '@/components/repository/risk-banners';
import { getRepository } from '@/lib/repositories';

export async function generateMetadata({
  params,
}: PageProps<'/repositorios/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const repository = await getRepository(id);
  return {
    title: repository ? `${repository.fullName} · OpenBridge` : 'No encontrado · OpenBridge',
  };
}

export default async function RepositoryPage({ params }: PageProps<'/repositorios/[id]'>) {
  const { id } = await params;
  const repository = await getRepository(id);
  if (!repository) notFound();

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-300 px-4 py-8 sm:px-8">
        <RepositoryHeader repository={repository} />
        <div className="mt-6 flex flex-col gap-3 empty:hidden">
          <RiskBanners repository={repository} />
        </div>
        <div className="mt-6 grid gap-10 border-t border-border pt-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="order-2 min-w-0 lg:order-1">
            <IntegrationIdeas ideas={repository.integrationIdeas} />
          </div>
          <aside
            aria-label="Datos del repositorio"
            className="order-1 flex flex-col gap-4 lg:order-2"
          >
            <HealthPanel repository={repository} />
            <MetricsPanel repository={repository} />
            <LicensePanel licenseSpdx={repository.licenseSpdx} />
            <TopicsPanel topics={repository.topics} />
          </aside>
        </div>
      </div>
    </main>
  );
}
