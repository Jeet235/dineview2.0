import React, { useEffect, useRef, useState } from 'react';
import { CategoryNav } from '../../components/CategoryNav';
import { MenuSection } from '../../components/MenuSection';
import { CartButton } from '../../components/CartButton';
import { ArrowUpRight } from 'lucide-react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { useMenu } from '../../context/MenuContext';
import { saveMenuScrollPosition, getAndClearMenuScrollPosition } from '../../utils/scrollRestoration';
import heroDiningImg from '../../assets/images/hero_dineview_dining_room_1795754444622.jpg';

export default function HomePage() {
  const { categories } = useMenu();
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id || '');
  const [reservationNotice, setReservationNotice] = useState<string | null>(null);
  const [heroLoaded, setHeroLoaded] = useState<boolean>(true);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const location = useLocation();
  const { lang, t } = useOutletContext<{ lang: string; t: Record<string, string>; isRTL?: boolean }>();
  const isRestoringScrollRef = useRef(false);

  // Synchronize activeCategory when categories list updates from Firestore
  useEffect(() => {
    if (categories.length > 0 && (!activeCategory || !categories.some(c => c.id === activeCategory))) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  // Restore saved scroll position when returning from Item Details
  useEffect(() => {
    const savedY = getAndClearMenuScrollPosition();
    if (savedY !== null && savedY > 0) {
      isRestoringScrollRef.current = true;
      window.scrollTo(0, savedY);

      const rafId = requestAnimationFrame(() => {
        window.scrollTo(0, savedY);
      });
      const timerId = setTimeout(() => {
        window.scrollTo(0, savedY);
      }, 50);

      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(timerId);
      };
    }
  }, []);

  // Safety net: save scroll position if unmounting because of navigating to an item details page
  useEffect(() => {
    return () => {
      if (window.location.pathname.startsWith('/item/')) {
        saveMenuScrollPosition();
      }
    };
  }, []);

  // Auto-scroll to matching section when navigating to /menu, /locations
  useEffect(() => {
    if (isRestoringScrollRef.current) {
      return;
    }
    const path = location.pathname.replace(/^\//, '');
    if (path === 'menu' || path === 'locations') {
      setTimeout(() => scrollToSection(path), 150);
    } else if (location.hash) {
      const targetId = location.hash.replace(/^#/, '');
      setTimeout(() => scrollToSection(targetId), 150);
    }
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveCategory(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-20% 0px -75% 0px',
      }
    );

    Object.values(sectionRefs.current).forEach((section) => {
      if (section) observer.observe(section as Element);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (sectionId: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    if (sectionId === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const element = document.getElementById(sectionId);
    if (element) {
      const yOffset = -68;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* Editorial Hero Showcase */}
      <section className="w-full h-[46vh] md:h-[68vh] min-h-[340px] max-h-[680px] relative bg-[#161615] flex flex-col justify-end overflow-hidden">
        {heroLoaded && (
          <img
            src={heroDiningImg}
            alt="DineView architectural dining room interior with limestone tables and warm pendant lighting"
            className="absolute inset-0 w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setHeroLoaded(false)}
          />
        )}
        {/* Measured scrim guaranteeing >=4.5:1 text contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/15" />

        <div className="relative z-10 max-w-6xl w-full mx-auto px-4 sm:px-8 pb-10 md:pb-16 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <h1 className="text-[clamp(2.5rem,5vw,4.5rem)] font-serif font-medium text-white tracking-tight leading-[1.05] mb-3">
              DineView
            </h1>
            <p className="text-white/85 text-sm sm:text-base font-normal leading-relaxed max-w-xl">
              {t.hero_subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => scrollToSection('menu', e)}
            className="self-start md:self-end bg-white text-text-primary px-6 py-3 rounded-sm text-sm font-medium hover:bg-bg-secondary transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.nav_menu || 'Explore Menu'}
          </button>
        </div>
      </section>

      {/* Unboxed Editorial Info Bar */}
      <div className="bg-bg-primary border-b border-border py-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs sm:text-sm text-text-secondary">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-text-primary font-medium">{t.location}</span>
            <span aria-hidden="true" className="text-text-muted">·</span>
            <span>{t.daily} {t.open_time}</span>
          </div>
          <a
            href="https://maps.google.com/?q=123+Culinary+Ave,+Food+District"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-text-primary hover:text-accent hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            <span>{t.directions}</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Menu Area Anchor */}
      <div id="menu" className="scroll-mt-16" />

      {/* Sticky Category Navigation */}
      <CategoryNav
        categories={categories}
        activeCategory={activeCategory}
        onSelectCategory={scrollToSection}
        translations={t}
      />

      {/* Main Menu Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 pb-24 w-full">
        {categories.length === 0 ? (
          <div className="py-24 text-center">
            <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-text-secondary text-sm">Loading seasonal menu...</p>
          </div>
        ) : (
          categories.map((category) => (
            <MenuSection
              key={category.id}
              category={category}
              ref={(el) => (sectionRefs.current[category.id] = el)}
              lang={lang}
              t={t}
            />
          ))
        )}
      </main>

      {/* Locations Section */}
      <section id="locations" className="py-20 border-t border-border bg-bg-secondary/60 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="max-w-lg">
            <h2 className="text-3xl md:text-4xl font-serif text-text-primary mb-3 leading-tight">
              {t.nav_locations}
            </h2>
            <p className="text-sm sm:text-base text-text-secondary leading-relaxed">
              {t.location}
              <span className="mx-2 text-text-muted" aria-hidden="true">·</span>
              {t.daily} {t.open_time}
            </p>
            {reservationNotice && (
              <p className="mt-4 text-sm text-accent font-medium">
                {reservationNotice}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setReservationNotice(t.reservation_coming_soon || 'Table reservation system coming soon.');
              setTimeout(() => setReservationNotice(null), 4000);
            }}
            className="self-start md:self-end bg-text-primary text-white px-6 py-3 rounded-sm text-sm font-medium hover:bg-[#2E2E2C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.book || 'Reserve a Table'}
          </button>
        </div>
      </section>

      {/* Floating Cart Button */}
      <CartButton t={t} />
    </>
  );
}
