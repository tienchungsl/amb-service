const { query } = require('../utils/db')

// constructor
const Agent = function (agent) {
  this.id = agent.id
  this.agent_prefix = agent.agent_prefix
}

Agent.findById = (id) => {
  return new Promise((resolve, reject) => {
    query(`SELECT * FROM agent WHERE agent_id = ?`, [id], (err, res) => {
      if (err) {
        return reject(err)
      }

      return resolve(res[0])
    })
  })
}

module.exports = Agent
