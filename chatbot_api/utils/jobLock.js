import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

/**
 * One runner per scheduled job across every API instance (pm2 cluster, two
 * servers behind a load balancer…). Each tick takes a MySQL named lock
 * (GET_LOCK, no wait): if another instance — or a still-running earlier tick
 * of this one — holds it, the tick is skipped. The lock lives on its own
 * connection, released when the job ends (or automatically if the process
 * dies, since MySQL drops a session's locks with the session).
 *
 * The locks use a small pool of their own so jobs holding a lock can never
 * use up the app's main pool (the job's own queries still go through it).
 */
const lockPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: Number(process.env.JOB_LOCK_CONNECTIONS) || 20,
  queueLimit: 0,
});

const lockName = (name) => `job:${process.env.DB_NAME || "db"}:${name}`.slice(0, 64);

/** Runs fn only if this instance got the job's lock. Returns fn's result, or undefined when skipped. */
export async function withJobLock(name, fn) {
  const conn = await lockPool.getConnection();
  const key = lockName(name);
  try {
    const [[row]] = await conn.query("SELECT GET_LOCK(?, 0) AS got", [key]);
    if (Number(row?.got) !== 1) return undefined;
    try {
      return await fn();
    } finally {
      await conn.query("SELECT RELEASE_LOCK(?)", [key]).catch(() => {});
    }
  } finally {
    conn.release();
  }
}

/** A setInterval-friendly wrapper: `setInterval(lockedJob("broadcasts", processDueBroadcasts), 60000)`. */
export function lockedJob(name, fn) {
  return () => withJobLock(name, fn).catch((err) => console.error(`[Job ${name}] failed:`, err.message));
}
