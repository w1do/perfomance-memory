/**
 * Декор hero внутри .card__deco (снизу вверх): полотно «разработка» (backgrounds/hero-code.svg)
 * и перспективный пол (backgrounds/grid-hero.svg) со сканирующим светом. Стили — hero.css.
 */
export function HeroDecor() {
  return (
    <>
      <span className="hero-code" />
      <span className="hero-floor" data-depth="sm">
        <span className="hero-floor__lines" />
        <span className="hero-floor__scan" />
      </span>
    </>
  );
}
