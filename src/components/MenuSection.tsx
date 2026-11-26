import { forwardRef } from 'react';
import { MenuCategory, MenuItem } from '../data/menu';
import { MenuItemCard } from './MenuItemCard';
import { useCart } from '../context/CartContext';

interface MenuSectionProps {
  category: MenuCategory;
  lang: string;
  t: Record<string, string>;
}

function getArDisplayPriority(item: MenuItem, categoryId: string): number {
  const hasArModel = Boolean(item.modelUrl || item.modelUrlAr);
  if (!hasArModel) return 100;

  // When Spicy Thai Basil Chicken and Pizza share Main Course, keep Spicy Thai Basil Chicken first
  // and Pizza immediately after it at the top of the category.
  if (categoryId === 'main-courses') {
    const id = item.id.toLowerCase();
    const name = (item.name || '').toLowerCase();
    if (id === 'm4' || name.includes('spicy thai basil chicken')) return 0;
    if (id === 'm5' || name.includes('pizza')) return 1;
  }

  return 0;
}

export const MenuSection = forwardRef<HTMLElement, MenuSectionProps>(
  ({ category, lang, t }, ref) => {
    const { items, addItem, updateQuantity } = useCart();

    const orderedItems = category.items
      .filter((item) => item.available !== false)
      .map((item, idx) => ({ item, idx }))
      .sort((a, b) => {
        const priorityDiff =
          getArDisplayPriority(a.item, category.id) -
          getArDisplayPriority(b.item, category.id);
        return priorityDiff !== 0 ? priorityDiff : a.idx - b.idx;
      })
      .map(({ item }) => item);

    return (
      <section ref={ref} id={category.id} className="pt-16 pb-12 scroll-mt-40 border-b border-border last:border-0">
        <div className="mb-8 md:mb-12">
          <h2 className="text-3xl md:text-4xl font-serif text-text-primary mb-2">
            {t[category.id] || t[category.name] || category.name}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
          {orderedItems.map((item) => {
            const cartItem = items.find(i => i.id === item.id);
            return (
              <MenuItemCard 
                key={item.id} 
                item={item} 
                lang={lang} 
                t={t} 
                cartQuantity={cartItem?.quantity || 0}
                cartItemId={cartItem?.cartItemId}
                addItem={addItem}
                updateQuantity={updateQuantity}
              />
            );
          })}
        </div>
      </section>
    );
  }
);

MenuSection.displayName = 'MenuSection';
