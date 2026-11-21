export type Permission = 'owner' | 'edit' | 'read';

export interface UserPrefs {
  theme?: 'light' | 'dark' | 'auto';
  reduceMotion?: boolean;
  dyslexiaFont?: boolean;
  dailyGoal?: number;
  onboarded?: boolean;
  writeTolerance?: Tolerance;
}

export interface Tolerance {
  accents: boolean;
  case: boolean;
  typos: boolean;
  punctuation: boolean;
}

export interface User {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  role: 'admin' | 'user';
  mustChangePassword: boolean;
  totpEnabled: boolean;
  prefs: UserPrefs;
  createdAt: string;
}

export interface SetSummary {
  id: number;
  ownerId: number;
  ownerName: string;
  folderId: number | null;
  title: string;
  description: string;
  termLang: string;
  defLang: string;
  color: string;
  tags: string[];
  linkAccess: boolean;
  createdAt: string;
  updatedAt: string;
  cardCount: number;
  permission: Permission;
  dueCount?: number;
  masteredCount?: number;
  lastStudiedAt?: string | null;
}

export interface CardProgress {
  dueAt: string;
  intervalDays: number;
  ease: number;
  repetitions: number;
  lapses: number;
  correct: number;
  wrong: number;
  mastered: boolean;
  difficult: boolean;
}

export interface Card {
  id: number;
  term: string;
  definition: string;
  example: string;
  note: string;
  image: string | null;
  audio: string | null;
  tags: string[];
  starred: boolean;
  progress: CardProgress | null;
}

export interface SetDetail {
  set: SetSummary;
  cards: Card[];
  shares?: { id: number; permission: 'read' | 'edit'; userId: number; username: string; displayName: string }[];
}

export interface Folder {
  id: number;
  name: string;
  setCount: number;
}

export type StudyMode = 'flashcards' | 'learn' | 'test' | 'match' | 'write' | 'listen' | 'review';
