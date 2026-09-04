import React from 'react';
import {CircleQuestionMark} from 'lucide-react';
import {DynamicIcon} from 'lucide-react/dynamic';

/** PascalCase Lucide component name to the dynamic package's kebab-case key. */
export const iconKey = (name: string) =>
  ({Globe2: 'globe', Waves: 'waves-horizontal', Bank: 'landmark'}[name] ?? name)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

type DynamicStudioIconProps = Record<string, unknown> & {
  name: string;
};

/**
 * Loads only the requested glyph chunk. The old `icons` namespace import
 * pulled every Lucide glyph into the editor's startup bundle.
 */
export const DynamicStudioIcon: React.FC<DynamicStudioIconProps> = ({name, ...props}) => (
  <DynamicIcon
    name={iconKey(name) as never}
    fallback={() => <CircleQuestionMark {...props} />}
    {...props}
  />
);
