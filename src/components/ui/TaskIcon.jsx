import {
  BookOpen,
  CircleCheck,
  Clock,
  Compass,
  Flame,
  GraduationCap,
  Languages,
  Layers,
  Medal,
  MessageSquare,
  ShieldAlert,
  Target,
  Type,
  Undo2,
} from 'lucide-react';

// The glyph beside a mission, quest or recommended action. The pack names an
// icon by key; this is the one place a key becomes a drawing.
//
// These replaced emoji, which render as whatever the OS vendor's font draws — a
// different picture on iOS, Android and Windows, none of it matching the line
// icons around it. Lucide is the set the tab bar already draws with, so a quest
// that sends you to Alphabet wears the Alphabet tab's own glyph.
//
// Stroke is `currentColor`: the caller's ink colours it, so it cannot drift out
// of step with the text beside it. Decorative — every row prints its label.
const GLYPHS = {
  alphabet: Type,
  book: BookOpen,
  cards: Layers,
  chat: MessageSquare,
  clock: Clock,
  compass: Compass,
  done: CircleCheck,
  flame: Flame,
  graduation: GraduationCap,
  medal: Medal,
  shield: ShieldAlert,
  target: Target,
  translate: Languages,
  undo: Undo2,
};

export default function TaskIcon({ name, size = 20, style }) {
  const Glyph = GLYPHS[name];
  if (!Glyph) return null;
  return (
    <Glyph
      data-task-icon={name}
      size={size}
      strokeWidth={1.75}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0, ...style }}
    />
  );
}
