const mysql = require('mysql')
const config = require('config')

const pool = mysql.createPool({
  host: config.get('db.host'),
  user: config.get('db.user'),
  password: config.get('db.password'),
  database: config.get('db.database'),
  timezone: config.get('db.timezone')
})

const poolRead = mysql.createPool({
  host: config.get('dbRead.host'),
  user: config.get('dbRead.user'),
  password: config.get('dbRead.password'),
  database: config.get('dbRead.database'),
  timezone: config.get('dbRead.timezone')
})

const execute = function (sql, values, callback) {
  pool.getConnection(function (err, conn) {
    if (err) {
      callback(err, null)
    } else {
      conn.query(sql, values, function (err, results) {
        callback(err, results)
      })
      conn.release()
    }
  })
}

const query = function (sql, values, callback) {
  poolRead.getConnection(function (err, conn) {
    if (err) {
      callback(err, null)
    } else {
      conn.query(sql, values, function (err, results) {
        callback(err, results)
      })
      conn.release()
    }
  })
}

module.exports = { execute, query }
