import React, { useEffect, useState } from 'react';
import * as LucideReact from 'lucide-react';

type IconProps = React.SVGProps<SVGSVGElement> & { name: string };

// Module is loaded statically, so icons are available immediately

export default function AsyncLucideIcon({ name, ...props }: IconProps) {
  const [Icon, setIcon] = useState<React.ComponentType<React.SVGProps<SVGSVGElement>> | null>(null);

  useEffect(() => {
    // Module already loaded by Dropdowns.tsx, so icons are immediately available
    const C = LucideReact[name];
    if (C) setIcon(() => C);
  }, [name]);

  if (!Icon) {
    // Render a visually inert SVG with same className to avoid layout shift.
    return <svg aria-hidden className={props.className} />;
  }

  return <Icon {...props} />;
}
