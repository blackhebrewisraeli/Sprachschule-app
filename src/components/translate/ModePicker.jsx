import { FIELD, SPACE, TEXT } from '../../lib/theme';
import { TRANSLATE_MODES } from './scaffold';

/**
 * How much help the learner wants for the current sentence — word bank, choose
 * the word, type the word, or free typing.
 *
 * The caption is its own element rather than bare text beside the select.
 * Loose JSX text followed by an element on the next line compiles with no
 * space between them ("MODE<select>"), which SonarCloud reports as ambiguous
 * spacing; the flex gap is what separates them, and it needs two boxes to act
 * on.
 */
export default function ModePicker({ value, onChange }) {
  return (
    <label
      style={{
        ...TEXT.label,
        display: 'flex',
        alignItems: 'center',
        gap: SPACE[2],
        marginBottom: SPACE[4],
      }}
    >
      <span>Mode</span>
      <select
        aria-label="Input mode"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...FIELD, flex: 1, minWidth: 0 }}
      >
        {TRANSLATE_MODES.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
