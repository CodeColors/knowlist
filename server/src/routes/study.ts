import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, nowIso } from '../db.js';
import { ACCESSIBLE_SETS_SQL, loadSet, permissionFor, type SetRow } from '../lib/access.js';
import { getId, parse } from '../lib/http.js';
import { requireAuth } from '../lib/session.js';
import { MASTERED_INTERVAL, newState, qualityFromResult, review } from '../lib/srs.js';
import { clampTz, computeStreak, endOfLocalDay, localDateKey, sqlTzModifier } from '../lib/time.js';
import { parsePrefs } from '../lib/users.js';

const MODES = ['flashcards', 'learn', 'test', 'match', 'write', 'listen', 'review'] as const;

export function recordAnswer(
  userId: number,
  a: { cardId: number; correct: boolean; mode: string; durationMs?: number; quality?: number; at?: string },
) {
  const card = db().prepare('SELECT c.id, c.set_id, s.* FROM cards c JOIN sets s ON s.id = c.set_id WHERE c.id = ?').get(a.cardId) as
    | (SetRow & { set_id: number })
    | undefined;
  if (!card) return false;
  if (!permissionFor({ ...card, id: card.set_id }, userId)) return false;
  const now = new Date();
  let at = a.at ? new Date(a.at) : now;
  if (Number.isNaN(at.getTime()) || at > now || now.getTime() - at.getTime() > 30 * 86400_000) at = now;
  const prev = db().prepare('SELECT * FROM study_progress WHERE user_id = ? AND card_id = ?').get(userId, a.cardId) as any;
  const state = prev
    ? { intervalDays: prev.interval_days, ease: prev.ease, repetitions: prev.repetitions, lapses: prev.lapses, dueAt: new Date(prev.due_at) }
    : newState(at);
  const q = a.quality ?? qualityFromResult(a.correct, a.durationMs);
  // En dehors de la révision espacée, une bonne réponse sur une carte pas encore due ne repousse pas l'échéance
  // (évite qu'un enchaînement de modes « gonfle » artificiellement l'intervalle le même jour).
  const notDueYet = prev && state.dueAt > at && a.mode !== 'review' && a.mode !== 'flashcards';
  const next = notDueYet && a.correct ? state : review(state, q, at);
  db()
    .prepare(
      `INSERT INTO study_progress (user_id, card_id, due_at, interval_days, ease, repetitions, lapses, correct_count, wrong_count, last_reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, card_id) DO UPDATE SET due_at = excluded.due_at, interval_days = excluded.interval_days, ease = excluded.ease,
         repetitions = excluded.repetitions, lapses = excluded.lapses,
         correct_count = study_progress.correct_count + excluded.correct_count,
         wrong_count = study_progress.wrong_count + excluded.wrong_count, last_reviewed_at = excluded.last_reviewed_at`,
    )
    .run(
      userId,
      a.cardId,
      next.dueAt.toISOString(),
      next.intervalDays,
      next.ease,
      next.repetitions,
      next.lapses,
      a.correct ? 1 : 0,
      a.correct ? 0 : 1,
      at.toISOString(),
    );
  db()
    .prepare('INSERT INTO study_log (user_id, card_id, set_id, mode, correct, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(userId, a.cardId, card.set_id, a.mode, a.correct ? 1 : 0, Math.min(Math.max(0, a.durationMs ?? 0), 600_000), at.toISOString());
  return true;
}

export function streakInfo(userId: number, tz: number) {
  const mod = sqlTzModifier(tz);
  const since = new Date(Date.now() - 400 * 86400_000).toISOString();
  const rows = db()
    .prepare(`SELECT date(created_at, ?) AS day, COUNT(*) AS n FROM study_log WHERE user_id = ? AND created_at >= ? GROUP BY day`)
    .all(mod, userId, since) as { day: string; n: number }[];
  const today = localDateKey(new Date(), tz);
  const days = new Set(rows.map((r) => r.day));
  const todayCount = rows.find((r) => r.day === today)?.n ?? 0;
  return { streak: computeStreak(days, today), todayCount, calendar: rows };
}

export default async function studyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/study/answers', async (req) => {
    const body = parse(
      z.object({
        answers: z
          .array(
            z.object({
              cardId: z.number().int().positive(),
              correct: z.boolean(),
              mode: z.enum(MODES),
              durationMs: z.number().int().min(0).max(3_600_000).optional(),
              quality: z.number().int().min(0).max(5).optional(),
              at: z.string().datetime().optional(),
            }),
          )
          .max(500),
      }),
      req.body,
    );
    const uid = req.user!.id;
    let accepted = 0;
    db().transaction(() => {
      for (const a of body.answers) if (recordAnswer(uid, a)) accepted++;
    })();
    return { accepted };
  });

  /** File « à réviser aujourd'hui » (toutes les cartes dues, tous sets accessibles confondus). */
  app.get('/study/due', async (req) => {
    const { tz, setId } = parse(z.object({ tz: z.coerce.number().optional(), setId: z.coerce.number().int().optional() }), req.query);
    const uid = req.user!.id;
    const until = endOfLocalDay(new Date(), clampTz(tz)).toISOString();
    const rows = db()
      .prepare(
        `SELECT c.id, c.set_id, c.term, c.definition, c.example, c.note, c.image, c.audio, s.title AS set_title, s.color, s.term_lang, s.def_lang,
                p.due_at, (st.card_id IS NOT NULL) AS starred
         FROM study_progress p JOIN cards c ON c.id = p.card_id JOIN sets s ON s.id = c.set_id
         LEFT JOIN stars st ON st.card_id = c.id AND st.user_id = ?
         WHERE p.user_id = ? AND p.due_at <= ? AND c.set_id IN (${ACCESSIBLE_SETS_SQL}) ${setId ? 'AND c.set_id = ?' : ''}
         ORDER BY p.due_at LIMIT 500`,
      )
      .all(...[uid, uid, until, uid, uid, ...(setId ? [setId] : [])]) as any[];
    return {
      cards: rows.map((r) => ({
        id: r.id,
        setId: r.set_id,
        setTitle: r.set_title,
        color: r.color,
        termLang: r.term_lang,
        defLang: r.def_lang,
        term: r.term,
        definition: r.definition,
        example: r.example,
        note: r.note,
        image: r.image,
        audio: r.audio,
        starred: !!r.starred,
        dueAt: r.due_at,
      })),
    };
  });

  app.get('/home', async (req) => {
    const { tz: rawTz } = parse(z.object({ tz: z.coerce.number().optional() }), req.query);
    const tz = clampTz(rawTz);
    const uid = req.user!.id;
    const until = endOfLocalDay(new Date(), tz).toISOString();
    const { n: dueCount } = db()
      .prepare(
        `SELECT COUNT(*) AS n FROM study_progress p JOIN cards c ON c.id = p.card_id WHERE p.user_id = ? AND p.due_at <= ? AND c.set_id IN (${ACCESSIBLE_SETS_SQL})`,
      )
      .get(uid, until, uid, uid) as { n: number };
    const recent = db()
      .prepare(
        `SELECT s.id, s.title, s.color, s.owner_id, (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.id) AS card_count,
           (SELECT COUNT(*) FROM cards c JOIN study_progress p ON p.card_id = c.id AND p.user_id = ? WHERE c.set_id = s.id AND p.interval_days >= ${MASTERED_INTERVAL}) AS mastered_count,
           (SELECT MAX(created_at) FROM study_log l WHERE l.set_id = s.id AND l.user_id = ?) AS last_studied_at
         FROM sets s WHERE s.id IN (${ACCESSIBLE_SETS_SQL})
         ORDER BY COALESCE(last_studied_at, s.updated_at) DESC LIMIT 6`,
      )
      .all(uid, uid, uid, uid) as any[];
    const { streak, todayCount } = streakInfo(uid, tz);
    const prefs = parsePrefs(req.user!.prefs);
    return {
      dueCount,
      streak,
      todayCount,
      dailyGoal: prefs.dailyGoal ?? 20,
      recentSets: recent.map((r) => ({
        id: r.id,
        title: r.title,
        color: r.color,
        cardCount: r.card_count,
        masteredCount: r.mastered_count,
        lastStudiedAt: r.last_studied_at,
      })),
    };
  });

  app.post('/study/match/:id', async (req) => {
    const uid = req.user!.id;
    const { set } = loadSet(getId(req), uid, 'read');
    const { timeMs } = parse(z.object({ timeMs: z.number().int().min(500).max(3_600_000) }), req.body);
    db().prepare('INSERT INTO match_scores (user_id, set_id, time_ms) VALUES (?, ?, ?)').run(uid, set.id, timeMs);
    return matchScores(uid, set.id);
  });

  app.get('/study/match/:id', async (req) => {
    const uid = req.user!.id;
    const { set } = loadSet(getId(req), uid, 'read');
    return matchScores(uid, set.id);
  });
}

function matchScores(uid: number, setId: number) {
  const best = db()
    .prepare('SELECT time_ms, created_at FROM match_scores WHERE user_id = ? AND set_id = ? ORDER BY time_ms ASC LIMIT 10')
    .all(uid, setId) as any[];
  return { scores: best.map((b) => ({ timeMs: b.time_ms, at: b.created_at })), now: nowIso() };
}
