/**
 * Logo Altris (versión negativa para fondo oscuro) con animación fade-in
 * left-to-right. Sirve /public/logo.svg.
 */
export function BrandLogo({ className = "h-6" }: { className?: string }) {
  return (
    <div className="animate-fade-ltr inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="Altris" className={className} />
    </div>
  );
}
