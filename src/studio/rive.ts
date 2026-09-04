import {makeId} from './storage';
import type {StudioMessage} from './types';

export type RiveProject = {
  id: string;
  name: string;
  /** Public URL, root-relative asset path, or uploaded data URL for a .riv file. */
  src: string;
  artboard: string;
  stateMachine: string;
  autoplay: boolean;
  messages: StudioMessage[];
  createdAt: number;
  updatedAt: number;
};

export const newRiveProject = (name: string): RiveProject => {
  const now = Date.now();
  return {
    id: makeId('rive'),
    name,
    src: '',
    artboard: '',
    stateMachine: '',
    autoplay: true,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
};

export const riveHasContent = (project: RiveProject) => Boolean(project.src.trim());
