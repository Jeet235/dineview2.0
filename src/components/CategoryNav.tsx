import { MenuCategory } from '../data/menu';

interface CategoryNavProps {
  categories: MenuCategory[];
  activeCategory: string;
  onSelectCategory: (id: string) => void;
  translations: Record<string, string>;
}

export function CategoryNav({ categories, activeCategory, onSelectCategory, translations }: CategoryNavProps) {
  return (
    <div className="sticky top-16 z-40 bg-bg-primary/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <ul className="flex overflow-x-auto hide-scrollbar py-3.5 gap-6 sm:gap-8 items-center">
          {categories.map((category) => {
            const isActive = category.id === activeCategory;
            return (
              <li key={category.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectCategory(category.id)}
                  className={`text-sm sm:text-base font-medium transition-colors whitespace-nowrap shrink-0 pb-1 cursor-pointer ${
                    isActive
                      ? 'text-text-primary border-b-2 border-accent'
                      : 'text-text-secondary hover:text-text-primary border-b-2 border-transparent'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {translations[category.id] || translations[category.name] || category.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
