import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatCurrency } from '../utils/currency';

export interface CartButtonProps {
  className?: string;
  variant?: 'floating' | 'header';
  t?: Record<string, string>;
}

export const CartButton: React.FC<CartButtonProps> = ({ 
  className = '', 
  variant = 'floating',
  t, 
}) => {
  const navigate = useNavigate();
  const { itemCount, total } = useCart();
  const translations: Record<string, string> = t || {};

  const handleNavigateToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate('/cart');
  };

  if (variant === 'header') {
    return (
      <button 
        type="button"
        onClick={handleNavigateToCart}
        className={`relative inline-flex items-center gap-1.5 px-2 py-1.5 text-text-secondary hover:text-text-primary transition-colors rounded-sm whitespace-nowrap shrink-0 ${className}`}
        aria-label={translations['nav_cart'] || 'Cart'}
      >
        <ShoppingBag className="w-4 h-4 shrink-0" />
        {itemCount > 0 && (
          <span className="text-xs font-mono tabular-nums font-medium text-text-primary">
            ({itemCount})
          </span>
        )}
      </button>
    );
  }

  // Floating variant for HomePage or customer browsing
  if (itemCount === 0) return null;

  return (
    <div 
      className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 end-4 sm:end-6 z-40 ${className}`}
    >
      <button
        type="button"
        onClick={handleNavigateToCart}
        className="flex items-center gap-3 bg-text-primary text-bg-primary px-4 sm:px-5 py-3 rounded-sm shadow-lg hover:bg-text-primary/90 transition-colors text-xs font-medium tracking-wide border border-white/10 whitespace-nowrap"
        aria-label={translations['view_cart'] || 'View Cart'}
      >
        <ShoppingBag className="w-4 h-4 shrink-0" />
        <span>{translations['view_cart'] || 'View Cart'}</span>
        <span className="font-mono tabular-nums text-bg-primary/70">({itemCount})</span>
        <span className="h-3.5 w-px bg-bg-primary/25" aria-hidden="true" />
        <span className="font-mono tabular-nums font-medium">{formatCurrency(total)}</span>
      </button>
    </div>
  );
};

export default CartButton;
