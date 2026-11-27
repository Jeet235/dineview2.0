import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useMenu } from '../../context/MenuContext';
import { ChevronLeft, Plus, Minus, UtensilsCrossed } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { ModelViewerModal } from '../../components/ModelViewerModal';
import { getMenuItemName, getMenuItemDescription } from '../../data/menu';

export default function ItemDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lang, t } = useOutletContext<{ lang: string; t: Record<string, string>; isRTL?: boolean }>();
  const { items, addItem, updateQuantity } = useCart();
  const { categories } = useMenu();
  const [imgError, setImgError] = useState(false);

  // Automatically scroll to top whenever navigating to an item details page or switching items
  useEffect(() => {
    window.scrollTo(0, 0);
    setImgError(false);
  }, [id]);

  // Find item by ID across all categories
  const item = categories.flatMap((cat) => cat.items).find((i) => i.id === id);

  if (!item) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center py-24">
        <h2 className="text-2xl font-serif text-text-primary mb-4">{t.item_not_found || 'Item not found'}</h2>
        <button 
          type="button"
          onClick={() => navigate(-1)}
          className="bg-text-primary text-bg-primary px-6 py-2.5 rounded-sm text-xs font-medium hover:bg-text-primary/90 transition-colors"
        >
          {t.go_back || 'Go Back'}
        </button>
      </div>
    );
  }

  const walkTime = Math.round(item.calories / 5);
  const existingCartItem = items.find((i) => i.id === item.id);
  const actualModelUrl = item.modelUrl || item.modelUrlAr;

  const displayName = getMenuItemName(item, lang);
  const displayDescription = getMenuItemDescription(item, lang);
  const dietaryLabels = (item.tags || []).map((tag) => t[`tag_${tag.id}`] || tag.label);

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 md:py-14 relative">
      <button 
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors mb-8 text-xs font-medium"
      >
        <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
        <span>{t.back_to_menu || 'Back to Menu'}</span>
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-14 items-start">
        <div>
          <div className="w-full aspect-[4/3] sm:aspect-square bg-bg-secondary rounded-sm overflow-hidden border border-border relative flex items-center justify-center">
            {item.image && !imgError ? (
              <img 
                src={item.image} 
                alt={displayName} 
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-text-muted gap-2 p-6">
                <UtensilsCrossed className="w-8 h-8 opacity-40" />
                <span className="text-xs font-serif">{displayName}</span>
              </div>
            )}
          </div>
          
          {actualModelUrl && (
            <ModelViewerModal
              modelUrl={actualModelUrl}
              modelUrlAr={item.modelUrlAr || actualModelUrl}
              iosSrc={item.iosSrc}
              poster={item.image}
              itemName={displayName}
              buttonClassName="mt-4 w-full flex items-center justify-center gap-2 border border-border bg-bg-primary text-text-primary px-6 py-3 rounded-sm text-xs font-medium hover:border-text-primary transition-colors"
              iconClassName="w-4 h-4"
            />
          )}
        </div>
        
        <div className="flex flex-col">
          {dietaryLabels.length > 0 && (
            <p className="text-xs text-accent font-medium mb-3">
              {dietaryLabels.join(' · ')}
            </p>
          )}

          <h1 className="text-3xl sm:text-4xl font-serif font-medium text-text-primary mb-3 leading-tight tracking-tight">
            {displayName}
          </h1>

          <p className="text-xl font-mono tabular-nums text-text-primary mb-6">
            {formatCurrency(item.price)}
          </p>

          <p className="text-sm sm:text-base text-text-secondary leading-relaxed mb-8">
            {displayDescription}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-10 pb-8 border-b border-border text-xs font-mono tabular-nums text-text-muted">
            <span>{item.calories} {t.kcal || 'kcal'}</span>
            <span aria-hidden="true">·</span>
            <span>{walkTime} {t.walk_min || 'min walk'}</span>
          </div>

          <div>
            {existingCartItem ? (
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center border border-border rounded-sm bg-white h-11">
                  <button 
                    type="button"
                    onClick={() => updateQuantity(existingCartItem.cartItemId, existingCartItem.quantity - 1)}
                    className="h-full px-3.5 text-text-secondary hover:text-text-primary transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-9 text-center text-sm font-mono tabular-nums font-medium text-text-primary">
                    {existingCartItem.quantity}
                  </span>
                  <button 
                    type="button"
                    onClick={() => updateQuantity(existingCartItem.cartItemId, existingCartItem.quantity + 1)}
                    disabled={existingCartItem.quantity >= (item.maxPerOrder ?? 20)}
                    className={`h-full px-3.5 transition-colors ${
                      existingCartItem.quantity >= (item.maxPerOrder ?? 20)
                        ? 'text-text-muted cursor-not-allowed opacity-40'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button 
                  type="button"
                  onClick={() => navigate('/cart')}
                  className="flex-1 h-11 bg-text-primary text-bg-primary px-6 rounded-sm text-xs font-medium hover:bg-text-primary/90 transition-colors text-center whitespace-nowrap"
                >
                  {t.view_cart || 'View Cart'}
                </button>
              </div>
            ) : (
              <button 
                type="button"
                onClick={() => addItem(item)}
                disabled={item.maxPerOrder === 0}
                className={`w-full h-11 px-6 rounded-sm text-xs font-medium transition-colors flex items-center justify-center gap-2 ${
                  item.maxPerOrder === 0
                    ? 'bg-text-muted text-bg-primary cursor-not-allowed opacity-50'
                    : 'bg-text-primary text-bg-primary hover:bg-text-primary/90'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>{t.add_to_cart || 'Add to Cart'}</span>
                <span className="opacity-60">·</span>
                <span className="font-mono tabular-nums">{formatCurrency(item.price)}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
