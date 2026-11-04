'use client';

import { Check, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { CategoryDot } from '@/components/shared/category-dot';
import { catalogHref, type CatalogParams } from '@/lib/catalog-url';
import type { CatalogFilters, MaintenanceLevel } from '@/lib/repositories';

const maintenanceLabels: Record<MaintenanceLevel, string> = {
  ACTIVE: 'Activo',
  MODERATE: 'Moderado',
  AT_RISK: 'En riesgo',
  ARCHIVED: 'Archivado',
};

const STAR_STEPS = [1_000, 5_000, 10_000, 50_000];
const VISIBLE_LANGUAGES = 5;

const formatStep = (n: number) => `${n / 1_000}k+`;

type Props = {
  filters: CatalogFilters;
  params: CatalogParams;
};

function Option({
  checked,
  onChange,
  label,
  count,
  dot,
  type = 'checkbox',
  name,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  count?: number;
  dot?: ReactNode;
  type?: 'checkbox' | 'radio';
  name?: string;
}) {
  return (
    <label className="flex h-[34px] cursor-pointer items-center gap-2.5 text-sm">
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`flex size-4 shrink-0 items-center justify-center border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground/40 ${
          type === 'radio' ? 'rounded-full' : 'rounded-[4px]'
        } ${checked ? 'border-foreground bg-foreground text-background' : 'border-border-strong bg-background'}`}
      >
        {checked &&
          (type === 'radio' ? (
            <span className="size-1.5 rounded-full bg-background" />
          ) : (
            <Check className="size-3" strokeWidth={2} />
          ))}
      </span>
      {dot}
      <span className="grow truncate">{label}</span>
      {count !== undefined && (
        <span className="font-mono text-[13px] text-muted-foreground tabular-nums">{count}</span>
      )}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="group border-t border-border">
      <summary className="flex h-10 cursor-pointer list-none items-center justify-between text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronUp
          className="size-3.5 text-muted-foreground transition-transform group-not-open:rotate-180"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </summary>
      <div className="pb-2">{children}</div>
    </details>
  );
}

export function FiltersPanel({ filters, params }: Props) {
  const router = useRouter();
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const { category, language, license, maintenance = [], minStars } = params;
  const active = Boolean(category || language || license || maintenance.length || minStars);

  // Un cambio de filtro vuelve a la primera página; el resto de la URL se conserva.
  function apply(next: CatalogParams) {
    router.push(catalogHref({ ...params, ...next, page: undefined }), { scroll: false });
  }

  const languages = showAllLanguages
    ? filters.languages
    : filters.languages.slice(0, VISIBLE_LANGUAGES);
  const steps = STAR_STEPS.filter((n) => n <= filters.stars.max);

  return (
    <form role="group" aria-label="Filtros" onSubmit={(e) => e.preventDefault()}>
      <div className="flex h-9 items-center justify-between">
        <h2 className="font-semibold">Filtros</h2>
        {active && (
          <button
            type="button"
            onClick={() =>
              apply({
                category: undefined,
                language: undefined,
                license: undefined,
                maintenance: undefined,
                minStars: undefined,
              })
            }
            className="rounded-sm text-[13px] text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
          >
            Limpiar
          </button>
        )}
      </div>

      <Section title="Categoría">
        {filters.categories.map((o) => (
          <Option
            key={o.value}
            checked={category === o.value}
            onChange={() => apply({ category: category === o.value ? undefined : o.value })}
            label={o.label}
            count={o.count}
            dot={<CategoryDot slug={o.value} />}
          />
        ))}
      </Section>

      <Section title="Lenguaje">
        {languages.map((o) => (
          <Option
            key={o.value}
            checked={language === o.value}
            onChange={() => apply({ language: language === o.value ? undefined : o.value })}
            label={o.value}
            count={o.count}
          />
        ))}
        {filters.languages.length > VISIBLE_LANGUAGES && (
          <button
            type="button"
            onClick={() => setShowAllLanguages((v) => !v)}
            className="flex h-[34px] items-center rounded-sm text-[13px] text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
          >
            {showAllLanguages ? 'Ver menos' : 'Ver más lenguajes'}
          </button>
        )}
      </Section>

      <Section title="Licencia">
        {filters.licenses.map((o) => (
          <Option
            key={o.value}
            checked={license === o.value}
            onChange={() => apply({ license: license === o.value ? undefined : o.value })}
            label={o.value}
            count={o.count}
          />
        ))}
      </Section>

      <Section title="Mantenimiento">
        {filters.maintenanceLevels.map((o) => (
          <Option
            key={o.value}
            checked={maintenance.includes(o.value)}
            onChange={() =>
              apply({
                maintenance: maintenance.includes(o.value)
                  ? maintenance.filter((m) => m !== o.value)
                  : [...maintenance, o.value],
              })
            }
            label={maintenanceLabels[o.value]}
            count={o.count}
          />
        ))}
      </Section>

      <Section title="Stars mínimas">
        {[undefined, ...steps].map((n) => (
          <Option
            key={n ?? 'any'}
            type="radio"
            name="minStars"
            checked={(minStars ?? undefined) === n}
            onChange={() => apply({ minStars: n })}
            label={n ? formatStep(n) : 'Cualquiera'}
          />
        ))}
      </Section>
    </form>
  );
}
