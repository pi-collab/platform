/**
 * Free-text search for the ops lists.
 *
 * The term goes into a PostgREST `or=(col.ilike.*term*,…)` filter, which is a
 * grammar, not a bound parameter: a comma inside the term starts another
 * condition and a parenthesis closes the group. So "Mehta, Aarav" would not
 * merely fail to match, it would be parsed as a second filter on a column that
 * does not exist and fail the whole query.
 *
 * Metacharacters are therefore stripped rather than escaped. PostgREST has no
 * escape for them inside this form, and a search box is not worth a parser.
 * Dots and @ survive because handles and emails contain them and they are inert
 * here: the value is everything after the operator, so a dot cannot start a new
 * clause.
 */
const MAX_TERM = 60

export function opsSearchTerm(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v) return ''
  return v
    // `,` and `()` break the filter grammar. `*` and `%` are ilike wildcards, so
    // a term containing them would silently widen the match. Backslash and
    // quotes have no business here either.
    .replace(/[,()*%\\"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TERM)
}

/** The `or=` argument for a set of columns, all matched case-insensitively. */
export function opsSearchFilter(columns: string[], term: string): string {
  return columns.map((c) => `${c}.ilike.*${term}*`).join(',')
}

/** A leading @ is how a creator writes their own handle, and how ops will type
 *  it. Matching on it would find nothing, since handles are stored bare. */
export function stripLeadingAt(term: string): string {
  return term.replace(/^@+/, '')
}
