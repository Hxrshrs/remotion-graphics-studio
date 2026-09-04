import React from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '@remotion/player';
import {compileScene} from './compile';
import {fallbackScene} from './fallbackScene';
(window as unknown as Record<string, unknown>).__probe = {React, createRoot, Player, compileScene, fallbackScene};