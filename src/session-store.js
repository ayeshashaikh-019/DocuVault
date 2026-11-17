const session = require('express-session');

class SQLiteSessionStore extends session.Store {
  constructor(database, options = {}) {
    super();
    this.db = database;
    this.ttl = options.ttl || 8 * 60 * 60 * 1000;
    this.getStatement = database.prepare('SELECT sess, expired FROM sessions WHERE sid = ?');
    this.setStatement = database.prepare(`
      INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired
    `);
    this.deleteStatement = database.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStatement = database.prepare('UPDATE sessions SET expired = ? WHERE sid = ?');
    this.pruneStatement = database.prepare('DELETE FROM sessions WHERE expired <= ?');
    this.lastPrune = 0;
  }

  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid);
      if (!row) return callback(null, null);
      if (row.expired <= Date.now()) {
        this.deleteStatement.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.ttl;
      this.setStatement.run(sid, JSON.stringify(sess), expires);
      this.pruneExpired();
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.ttl;
      this.touchStatement.run(expires, sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.deleteStatement.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  clear(callback = () => {}) {
    try {
      this.db.prepare('DELETE FROM sessions').run();
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  pruneExpired() {
    const now = Date.now();
    if (now - this.lastPrune < 60_000) return;
    this.pruneStatement.run(now);
    this.lastPrune = now;
  }
}

module.exports = SQLiteSessionStore;
