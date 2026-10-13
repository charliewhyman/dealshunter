import React, { useEffect, useState } from 'react';

type IconProps = React.SVGProps<SVGSVGElement> & { name: string };

// Module-level cache so once lucide-react is imported, icons are available
// synchronously to avoid rendering the empty fallback during brief remounts.
let lucideModule: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> | null = null;
let lucideImportPromise: Promise<typeof import('lucide-react')> | null = null;

export default function AsyncLucideIcon({ name, ...props }: IconProps) {
  // If module already loaded, derive initial icon synchronously to avoid fallback flash
  const initialIcon = lucideModule ? (lucideModule[name] as React.ComponentType<React.SVGProps<SVGSVGElement>> | undefined) ?? null : null;
  const [Icon, setIcon] = useState<React.ComponentType<React.SVGProps<SVGSVGElement>> | null>(initialIcon ?? null);

  useEffect(() => {
    let mounted = true;

    // If we already have the icon synchronously (module loaded), ensure state matches
    if (lucideModule) {
      const C = lucideModule[name];
      if (mounted && C) setIcon(() => C);
      return () => { mounted = false; };
    }

    // If import already in-flight, attach to it; otherwise start import
    if (!lucideImportPromise) {
      lucideImportPromise = import('lucide-react');
    }

    lucideImportPromise
      .then((mod) => {
        // Cache module for subsequent synchronous access
        lucideModule = mod as unknown as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>;
        const C = lucideModule[name];
        if (mounted && C) setIcon(() => C);
      })
      .catch(() => {
        // ignore failures — render fallback
      });

    return () => {
      mounted = false;
    };
  }, [name]);

  if (!Icon) {
    // Render a visually inert SVG with same className to avoid layout shift.
    return <svg aria-hidden className={props.className} />;
  }

  return <Icon {...props} />;
}
