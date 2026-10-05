/**
 * Extract the CONCIERGE NOTES bulleted section from the analyser's text
 * response. Returns at most 4 notes, stripped of bullet prefixes and
 * trimmed. Empty array when the heading is absent or no valid bullets
 * follow it.
 *
 * Guardrails:
 *  - Notes longer than 200 characters are dropped (model drifted off-format).
 *  - Case-insensitive heading match.
 *  - Tolerant of leading whitespace on bullet lines.
 */
export function parseConciergeNotes(analysis: string): string[] {
  const match = analysis.match(/CONCIERGE NOTES:\s*\n((?:\s*-\s*.+\n?)+)/i);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter((line) => line.length > 0 && line.length <= 200)
    .slice(0, 4);
}

/**
 * Remove the CONCIERGE NOTES section (heading + bullets) from the analyser
 * text. Used by runAnalysis to keep user-facing narration out of the
 * `analysis` string that gets piped into the Lambda's Nano Banana prompt —
 * the image model only needs the structural/furniture reasoning (sections
 * 1-5), not the concierge copy written for the user.
 *
 * Matches either at start-of-string or after newline(s); tolerant of the
 * same edge cases as parseConciergeNotes.
 */
export function stripConciergeNotes(analysis: string): string {
  return analysis
    .replace(/(?:^|\n+)CONCIERGE NOTES:\s*\n(?:\s*-\s*.+\n?)+/i, '')
    .trim();
}
