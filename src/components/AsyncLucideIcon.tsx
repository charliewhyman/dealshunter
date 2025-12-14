import React, { useEffect, useState } from 'react';

type IconProps = React.SVGProps<SVGSVGElement> & { name: string };

export default function AsyncLucideIcon({ name, ...props }: IconProps) {
  const [Icon, setIcon] = useState<React.ComponentType<React.SVGProps<SVGSVGElement>> | null>(null);

  useEffect(() => {
    let mounted = true;
    // Dynamically import the lucide-react bundle and pick the requested icon
    import('lucide-react')
      .then((mod) => {
        const C = (mod as any)[name];
        if (mounted && C) setIcon(() => C as React.ComponentType<React.SVGProps<SVGSVGElement>>);
      })
      .catch(() => {
        // ignore failures — render fallback
      });

    return () => {
      mounted = false;
    };
  }, [name]);

  if (!Icon) {
    // simple empty fallback to avoid layout shift
    return <svg aria-hidden className={props.className} />;
  }

  return <Icon {...props} />;
}
