/**
 * One relevance-search builder for every search box in the app.
 *
 * Before this, each list endpoint hand-rolled `LIKE '%term%'` across a few
 * columns. That has three problems users actually notice: multi-word queries
 * fail ("john dhaka" only matches if those words are adjacent in one column),
 * results come back in `updated_at` order so the best match is rarely first,
 * and every query is a full leading-wildcard scan.
 *
 * What this produces instead, per search:
 *   - tokenised AND semantics — every word must appear somewhere in the row
 *   - prefix matching, so "joh" finds "John" while you are still typing
 *   - "quoted phrases" kept intact
 *   - a weighted relevance score (name beats email beats body) used for
 *     ORDER BY, plus exact/prefix boosts so a precise hit ranks first
 *   - a LIKE fallback for tokens below InnoDB's minimum token length and for
 *     mid-word substrings that FULLTEXT cannot match by design
 *
 * Deliberately built on plain MySQL FULLTEXT rather than a search service:
 * this deployment runs a single MySQL instance with no Redis/queue, so
 * anything needing a separate indexed store would be new infrastructure to
 * run and keep in sync. The one thing that genuinely needs such a service is
 * typo tolerance ("jhon" -> "John"); MySQL has no fuzzy matching, so that is
 * the known limit of this approach.
 */
import pool from "../db.js";

// FULLTEXT operators — stripped from user input so a stray "+" or "-" can
// never change the meaning of the generated boolean expression.
const BOOLEAN_OPERATORS = /[+\-><()~*"@]/g;

let minTokenSizePromise = null;
let fulltextIndexPromise = null;

/** InnoDB ignores tokens shorter than this; below it we must use LIKE. */
function getMinTokenSize() {
  if (!minTokenSizePromise) {
    minTokenSizePromise = pool
      .query("SHOW VARIABLES LIKE 'innodb_ft_min_token_size'")
      .then(([rows]) => Number(rows?.[0]?.Value) || 3)
      .catch(() => 3);
  }
  return minTokenSizePromise;
}

/**
 * Which (table, column-set) combinations actually carry a FULLTEXT index.
 * Emitting MATCH() against an unindexed column is a hard MySQL error (1191),
 * so this is checked rather than assumed — that way a deployment that hasn't
 * run migrate_search_indexes.js yet degrades to LIKE-only instead of every
 * search endpoint returning a 500.
 */
function getFulltextIndexes() {
  if (!fulltextIndexPromise) {
    fulltextIndexPromise = pool
      .query(
        `SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
           FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND INDEX_TYPE = 'FULLTEXT'
          GROUP BY TABLE_NAME, INDEX_NAME`
      )
      .then(([rows]) => {
        const set = new Set();
        for (const r of rows) {
          set.add(`${r.TABLE_NAME.toLowerCase()}:${r.cols.toLowerCase()}`);
        }
        return set;
      })
      .catch(() => new Set());
  }
  return fulltextIndexPromise;
}

/** Call after a migration adds indexes, so a running process picks them up. */
export function resetSearchIndexCache() {
  fulltextIndexPromise = null;
  minTokenSizePromise = null;
}

/** Splits a raw query into "quoted phrases" and bare words. */
function tokenize(term) {
  const phrases = [];
  const withoutPhrases = term.replace(/"([^"]*)"/g, (_, phrase) => {
    const clean = phrase.trim();
    if (clean) phrases.push(clean);
    return " ";
  });
  const words = withoutPhrases
    .split(/[\s,]+/)
    .map((w) => w.replace(BOOLEAN_OPERATORS, "").trim())
    .filter(Boolean);
  return { phrases, words };
}

/**
 * Builds the WHERE fragment and relevance expression for one search box.
 *
 * @param {object}   opts
 * @param {string}   opts.term       raw text the user typed
 * @param {Array}    opts.fulltext   [{ table, columns: ['name'], expr: 'c.name', weight: 3 }]
 *                                   `expr` is what goes inside MATCH() (alias-qualified);
 *                                   `columns` identify the index on `table`.
 * @param {string[]} opts.like       alias-qualified columns for the fallback/substring match
 * @param {object}   [opts.boost]    { expr: 'c.name', exact: 10, prefix: 5, contains: 2 }
 * @returns {Promise<{active, where, whereParams, relevance, relevanceParams}>}
 */
export async function buildSearch({ term, fulltext = [], like = [], boost = null }) {
  const raw = (term || "").trim();
  if (!raw) {
    return { active: false, where: "", whereParams: [], relevance: "0", relevanceParams: [] };
  }

  const { phrases, words } = tokenize(raw);
  if (phrases.length === 0 && words.length === 0) {
    return { active: false, where: "", whereParams: [], relevance: "0", relevanceParams: [] };
  }

  const [minTokenSize, ftIndexes] = await Promise.all([getMinTokenSize(), getFulltextIndexes()]);

  const usableFulltext = [];
  for (const group of fulltext) {
    const key = `${String(group.table).toLowerCase()}:${group.columns.map((c) => c.toLowerCase()).join(",")}`;
    if (ftIndexes.has(key)) usableFulltext.push(group);
  }

  // Boolean expression: every phrase and every long-enough word is required
  // (+), and bare words match as prefixes (*) so results appear as you type.
  const booleanParts = [
    ...phrases.map((p) => `+"${p.replace(/"/g, "")}"`),
    ...words.filter((w) => w.length >= minTokenSize).map((w) => `+${w}*`),
  ];
  const booleanExpr = booleanParts.join(" ");
  const canUseFulltext = usableFulltext.length > 0 && booleanExpr.length > 0;

  const whereOr = [];
  const whereParams = [];

  if (canUseFulltext) {
    for (const group of usableFulltext) {
      whereOr.push(`MATCH(${group.expr}) AGAINST (? IN BOOLEAN MODE)`);
      whereParams.push(booleanExpr);
    }
  }

  // LIKE fallback. Each token must appear in at least one column (AND across
  // tokens, OR across columns) — the same "all words must be present"
  // behaviour as the FULLTEXT branch, so short queries, mid-word substrings
  // and stopword-only queries still return sensible results.
  if (like.length > 0) {
    const perToken = [...phrases, ...words].map((token) => {
      const cols = like.map((col) => `${col} LIKE ?`);
      for (let i = 0; i < like.length; i++) whereParams.push(`%${token}%`);
      return `(${cols.join(" OR ")})`;
    });
    if (perToken.length > 0) whereOr.push(`(${perToken.join(" AND ")})`);
  }

  if (whereOr.length === 0) {
    return { active: false, where: "", whereParams: [], relevance: "0", relevanceParams: [] };
  }

  // Relevance: weighted FULLTEXT scores, plus boosts that push an exact or
  // prefix hit on the primary column above a merely-contains-it row.
  const relevanceParts = [];
  const relevanceParams = [];

  if (canUseFulltext) {
    for (const group of usableFulltext) {
      relevanceParts.push(`(MATCH(${group.expr}) AGAINST (? IN BOOLEAN MODE) * ${Number(group.weight) || 1})`);
      relevanceParams.push(booleanExpr);
    }
  }

  if (boost?.expr) {
    const { expr, exact = 10, prefix = 5, contains = 2 } = boost;
    // Compared against the de-quoted text: a user searching "Ranzu" with
    // quotes still means the name Ranzu, and should get the same exact/prefix
    // boost as the unquoted query.
    const boostTerm = raw.replace(/"/g, "").trim();
    relevanceParts.push(`(CASE WHEN ${expr} = ? THEN ${exact} ELSE 0 END)`);
    relevanceParams.push(boostTerm);
    relevanceParts.push(`(CASE WHEN ${expr} LIKE ? THEN ${prefix} ELSE 0 END)`);
    relevanceParams.push(`${boostTerm}%`);
    relevanceParts.push(`(CASE WHEN ${expr} LIKE ? THEN ${contains} ELSE 0 END)`);
    relevanceParams.push(`%${boostTerm}%`);
  }

  return {
    active: true,
    where: `(${whereOr.join(" OR ")})`,
    whereParams,
    relevance: relevanceParts.length ? `(${relevanceParts.join(" + ")})` : "0",
    relevanceParams,
  };
}
