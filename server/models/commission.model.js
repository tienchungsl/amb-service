const { query } = require('../utils/db')

// constructor
const Commission = function (data) {
  this.id = data.id
}

Commission.getConfig = (gameId, agentId) => {
  return new Promise((resolve, reject) => {
    query(`SELECT percent_user_commission, percent_agent_share, percent_agent_commission_share FROM commission WHERE casino_game_id = ? AND agent_id = ?`, [gameId, agentId], (err, res) => {
      if (err) {
        return reject(err)
      }

      return resolve(res[0])
    })
  })
}

module.exports = Commission
