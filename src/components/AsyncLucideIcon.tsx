import React from 'react';
import * as LucideReact from 'lucide-react';

type IconProps = React.SVGProps<SVGSVGElement> & { name: string };

// Module is loaded statically, so icons are available immediately

export default function AsyncLucideIcon({ name, ...props }: IconProps) {
  // Module already loaded by Dropdowns.tsx, so icons are immediately available
  const Icon = (LucideReact as Record<string, unknown>)[name] as
    | React.ComponentType<React.SVGProps<SVGSVGElement>>
    | undefined;

  if (!Icon) {
    // Render a visually inert SVG with same className to avoid layout shift.
    return <svg aria-hidden className={props.className} />;
  }

  return <Icon {...props} />;
}
