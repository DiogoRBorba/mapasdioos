export type AccessRole = 'player' | 'admin';
export type Campaign = {
  type: 'map' | 'social' | 'shadows';
  id: string; title: string; subtitle: string; number: string; image: string; description: string;
  placeholder: boolean; revision: number; hasPlayerPassword: boolean;
  map: { width: number; height: number; builtin: boolean } | null;
};
