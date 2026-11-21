import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { ACCESSIBLE_SETS_SQL } from '../lib/access.js';
import { parse } from '../lib/http.js';
import { requireAuth } from '../lib/session.js';
import { MASTERED_INTERVAL } from '../lib/srs.js';
import { clampTz } from '../lib/time.js';
import { parsePrefs } from '../lib/users.js';
import { streakInfo } from './study.js';

export default async function statsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/stats', async (req) => {
    const { tz: rawTz } = parse(z.object({ tz: z.coerce.number().optional() }), req.query);
    const tz = clampTz(rawTz);
    const uid = req.user!.id;
    const totals = db()
      .prepare(
        `SELECT COUNT(*) AS studied,
           SUM(CASE WHEN interval_days >= ${MASTERED_INTERVAL} THEN 1 ELSE 0 END) AS mastered,
           SUM(correct_count) AS correct, SUM(wrong_count) AS wrong
         FROM study_progress p JOIN cards c ON c.id = p.card_id
         WHERE p.user_id = ? AND c.set_id IN (${ACCESSIBLE_SETS_SQL})`,
      )
      .get(uid, uid, uid) as any;
    const { n: totalCards } = db()
      .prepare(`SELECT COUNT(*) AS n FROM cards WHERE set_id IN (${ACCESSIBLE_SETS_SQL})`)
      .get(uid, uid) as { n: number };
    const time = db().prepare('SELECT COALESCE(SUM(duration_ms), 0) AS ms, COUNT(*) AS answers FROM study_log WHERE user_id = ?').get(uid) as any;
    const hardest = db()
      .prepare(
        `SELECT c.id, c.term, c.definition, s.id AS set_id, s.title AS set_title, p.wrong_count, p.correct_count, p.lapses
         FROM study_progress p JOIN cards c ON c.id = p.card_id JOIN sets s ON s.id = c.set_id
         WHERE p.user_id = ? AND p.wrong_count > 0 AND c.set_id IN (${ACCESSIBLE_SETS_SQL})
         ORDER BY (p.wrong_count * 1.0 / (p.correct_count + p.wrong_count)) DESC, p.lapses DESC, p.wrong_count DESC LIMIT 10`,
      )
      .all(uid, uid, uid) as any[];
    const perMode = db()
      .prepare('SELECT mode, COUNT(*) AS n, SUM(correct) AS ok FROM study_log WHERE user_id = ? GROUP BY mode')
      .all(uid) as any[];
    const { streak, todayCount, calendar } = streakInfo(uid, tz);
    const answered = (totals.correct ?? 0) + (totals.wrong ?? 0);
    return {
      totalCards,
      studiedCards: totals.studied ?? 0,
      masteredCards: totals.mastered ?? 0,
      timeSpentMs: time.ms,
      answers: time.answers,
      successRate: answered ? (totals.correct ?? 0) / answered : null,
      streak,
      todayCount,
      dailyGoal: parsePrefs(req.user!.prefs).dailyGoal ?? 20,
      calendar: calendar.map((c) => ({ date: c.day, count: c.n })),
      perMode: perMode.map((m) => ({ mode: m.mode, answers: m.n, correct: m.ok })),
      hardest: hardest.map((h) => ({
        id: h.id,
        term: h.term,
        definition: h.definition,
        setId: h.set_id,
        setTitle: h.set_title,
        wrong: h.wrong_count,
        correct: h.correct_count,
        lapses: h.lapses,
      })),
    };
  });
}
