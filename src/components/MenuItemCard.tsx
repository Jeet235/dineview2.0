import React, { memo, useState } from 'react';
import { MenuItem, getMenuItemName, getMenuItemDescription } from '../data/menu';
import { Plus, Minus, UtensilsCrossed } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/currency';
import { ModelViewerModal } from './ModelViewerModal';
import { saveMenuScrollPosition } from '../utils/scrollRestoration';

interface Props {
  item: MenuItem;
  lang: string;
  t: Record<string, string>;
  cartQuantity: number;
  cartItemId?: string;
  addItem: (item: MenuItem) => void;
  updateQuantity: (id: string, qty: number) => void;
}

export const MenuItemCard: React.FC<Props> = memo(({ 
  item, 
  lang, 
  t, 
  cartQuantity,
  cartItemId,
  addItem,
  updateQuantity
}) => {
  const walkTime = Math.round(item.calories / 5);
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);

  const actualModelUrl = item.modelUrl || item.modelUrlAr;
  const displayName = getMenuItemName(item, lang);
  const displayDescription = getMenuItemDescription(item, lang);

  const handleItemClick = () => {
    saveMenuScrollPosition();
    navigate(`/item/${item.id}`);
  };

  return (
    <article className="flex flex-col group relative transition-transform duration-200 hover:-translate-y-0.5">
      <div
        className="relative w-full aspect-[4/3] bg-bg-secondary rounded-sm overflow-hidden mb-5 cursor-pointer border border-border/70"
        onClick={handleItemClick}
      >
        {!imgError && item.image ? (
          <img
            src={item.image}
            alt={displayName}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-text-muted bg-bg-secondary p-4 text-center">
            <UtensilsCrossed className="w-6 h-6" aria-hidden="true" />
            <span className="text-xs font-medium">{displayName}</span>
          </div>
        )}
      </div>

      <div className="flex justify-between items-baseline gap-4">
        <h3
          className="text-lg sm:text-xl font-serif font-medium text-text-primary leading-snug cursor-pointer hover:text-accent transition-colors"
          onClick={handleItemClick}
        >
          {displayName}
        </h3>
        <span className="text-base font-mono font-medium tabular-nums text-text-primary shrink-0">
          {formatCurrency(item.price)}
        </span>
      </div>

      {/* Unboxed dietary metadata separated by typographic dots */}
      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-xs text-text-muted">
          {item.tags.map((tag, idx) => (
            <React.Fragment key={tag.id}>
              {idx > 0 && <span aria-hidden="true">·</span>}
              <span className={tag.id === 'spicy' ? 'text-red-700 font-medium' : tag.id === 'v' || tag.id === 'vg' ? 'text-emerald-800 font-medium' : ''}>
                {t[`tag_${tag.id}`] || tag.label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      <p className="text-sm text-text-secondary mt-2.5 leading-relaxed line-clamp-2 flex-1">
        {displayDescription}
      </p>

      <div className="flex items-center justify-between gap-3 mt-5 pt-3.5 border-t border-border/70">
        <div className="flex items-center gap-2 text-xs text-text-muted tabular-nums">
          <span>{item.calories} {t.kcal || 'kcal'}</span>
          <span aria-hidden="true">·</span>
          <span>{walkTime} {t.walk_min || 'min walk'}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {actualModelUrl && (
            <ModelViewerModal
              modelUrl={actualModelUrl}
              modelUrlAr={item.modelUrlAr || actualModelUrl}
              iosSrc={item.iosSrc}
              poster={item.image}
              itemName={displayName}
            />
          )}

          {cartQuantity > 0 && cartItemId ? (
            <div className="flex items-center bg-white border border-border rounded-sm h-9 overflow-hidden">
              <button
                type="button"
                onClick={() => updateQuantity(cartItemId, cartQuantity - 1)}
                className="w-8 h-full flex items-center justify-center text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
                aria-label="Decrease quantity"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-7 text-center text-xs font-mono font-medium tabular-nums text-text-primary">
                {cartQuantity}
              </span>
              <button
                type="button"
                onClick={() => updateQuantity(cartItemId, cartQuantity + 1)}
                disabled={cartQuantity >= (item.maxPerOrder ?? 20)}
                className={`w-8 h-full flex items-center justify-center transition-colors ${
                  cartQuantity >= (item.maxPerOrder ?? 20)
                    ? 'text-text-muted cursor-not-allowed opacity-50'
                    : 'text-text-primary hover:bg-bg-secondary cursor-pointer'
                }`}
                aria-label="Increase quantity"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => addItem(item)}
              disabled={item.maxPerOrder === 0}
              className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-sm text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                item.maxPerOrder === 0
                  ? 'bg-text-muted text-white cursor-not-allowed opacity-50'
                  : 'bg-text-primary text-white hover:bg-[#2E2E2C] cursor-pointer'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.add || 'Add'}</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}, (prevProps, nextProps) => {
  const p = prevProps.item;
  const n = nextProps.item;
  return p.id === n.id && 
         p.name === n.name && 
         p.price === n.price && 
         p.description === n.description && 
         p.image === n.image && 
         p.calories === n.calories && 
         p.available === n.available && 
         p.maxPerOrder === n.maxPerOrder && 
         p.modelUrl === n.modelUrl && 
         p.modelUrlAr === n.modelUrlAr && 
         p.iosSrc === n.iosSrc && 
         prevProps.cartQuantity === nextProps.cartQuantity && 
         prevProps.cartItemId === nextProps.cartItemId && 
         prevProps.lang === nextProps.lang && 
         prevProps.t === nextProps.t;
});
