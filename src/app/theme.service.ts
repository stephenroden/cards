import { Injectable, signal } from '@angular/core';

const THEME_STORAGE_KEY = 'hearts.theme';

export type ThemeId = 'classic' | 'ocean' | 'sunset' | 'ember' | 'forest-night' | 'slate' | 'neon' | 'high-contrast';

export interface ThemeOption {
  id: ThemeId;
  label: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { id: 'classic', label: 'Classic Green' },
  { id: 'ocean', label: 'Ocean Blue' },
  { id: 'sunset', label: 'Sunset Gold' },
  { id: 'ember', label: 'Ember Red' },
  { id: 'forest-night', label: 'Forest Night' },
  { id: 'slate', label: 'Slate Gray' },
  { id: 'neon', label: 'Neon Lime' },
  { id: 'high-contrast', label: 'High Contrast' }
];

const isThemeId = (value: string): value is ThemeId => THEME_OPTIONS.some((theme) => theme.id === value);

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  readonly options = THEME_OPTIONS;
  readonly theme = signal<ThemeId>('sunset');

  initialize(): void {
    const saved = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    const initial = saved && isThemeId(saved) ? saved : 'sunset';
    this.setTheme(initial);
  }

  setTheme(theme: ThemeId): void {
    this.theme.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  }
}
