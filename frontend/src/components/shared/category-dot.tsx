import { getCategoryStyle } from '@/lib/category-styles';

export function CategoryDot({ slug, className = '' }: { slug: string; className?: string }) {
  return (
    <span className={`size-2 shrink-0 rounded-full ${getCategoryStyle(slug).dot} ${className}`} />
  );
}
