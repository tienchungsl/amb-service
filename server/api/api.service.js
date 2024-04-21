'use strict'

const axios = require('axios')
const config = require('config')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const _ = require('lodash')

const logger = require('../utils/logger')
const Transaction = require('../models/transaction.model')
const Agent = require('../models/agent.model')
const Commission = require('../models/commission.model')

const encryptToken = function (key, userId, agentId) {
  const token = jwt.sign({ userId, agentId }, key, { expiresIn: '1d' })
  return token
}

const encryptAgentToken = function (key, agentId) {
  const token = jwt.sign({ agentId }, key, { expiresIn: '30m' })
  return token
}

const loginAndLaunchGame = async function (agentId, userId, gameKey, gameCode, username, isMobile) {
  const token = encryptToken(gameKey, agentId, userId)
  const options = {
    method: 'post',
    url: `${config.get('api.url')}/seamless/logIn`,
    auth: {
      username: config.get('api.username'),
      password: config.get('api.apiKey')
    },
    data: {
      username,
      productId: config.get('api.productId'),
      gameCode,
      isMobileLogin: isMobile,
      sessionToken: token,
      betLimit: []
    }
  }
  try {
    const response = await axios(options)
    const data = response.data
    if (data.code !== 0) {
      throw new Error(data.message)
    }
    return data.data?.url
  } catch (error) {
    logger.error(error, `Failed to fetch /seamless/games`)
    error.logged = true
    throw error
  }
}

const getSerialNo = function () {
  const serialNo = uuidv4()
  return serialNo
}

const listGames = async function () {
  const options = {
    method: 'get',
    url: `${config.get('api.url')}/seamless/games?productId=${config.get('api.productId')}`,
    auth: {
      username: config.get('api.username'),
      password: config.get('api.apiKey')
    }
  }
  try {
    const response = await axios(options)
    const data = response.data
    if (data.code !== 0) {
      throw new Error(data.message)
    }

    return data.data.games.map((game) => {
      return {
        ...game,
        GameType: game.type,
        GameTypeName: game.type,
        GameCode: game.code,
        GameName: game.name,
        GameImage: game.img,
        Order: game.rank
      }
    })
  } catch (error) {
    logger.error(error, `Failed to fetch /seamless/games`)
    error.logged = true
    throw error
  }
}

const getAgent = async function (server, agentId) {
  const cacheName = `agent-${agentId}`
  const cached = await server.methods.getCache(cacheName)
  if (cached) {
    return cached.data
  }

  const data = await Agent.findById(agentId)
  await server.methods.setCache(cacheName, data)
  return data
}

const getUser = async function (server, agentId, userId) {
  const { callback_domain, agent_key } = await getAgent(server, agentId)
  const agentToken = encryptAgentToken(agent_key, agentId)
  const options = {
    method: 'get',
    url: `${callback_domain}/api/users/${userId}`,
    headers: {
      'Authorization': agentToken
    },
    timeout: 20000
  }

  try {
    const response = await axios(options)
    return response.data
  } catch (error) {
    logger.error(error, `Failed to fetch agent data agentId = ${agentId}, userId = ${userId}`)
    error.logged = true
    throw error
  }
}

const getCredit = async function (server, agentId, userId) {
  const { credit } = await getUser(server, agentId, userId)
  return parseFloat((credit || 0.0).toFixed(2))
}

const updateCredit = async function (server, agentId, userId, credit, reference) {
  if (credit === 0.0) {
    return
  }
  const { callback_domain, agent_key } = await getAgent(server, agentId)
  const agentToken = encryptAgentToken(agent_key, agentId)

  const options = {
    method: 'post',
    url: `${callback_domain}/api/wallet/balance`,
    data: {
      userId,
      serviceName: config.get('app.name'),
      balance: credit,
      reference: `${reference}`
    },
    headers: {
      'Authorization': agentToken,
      'x-request-id': uuidv4()
    }
  }

  try {
    const response = await axios(options)
    return response.data
  } catch (error) {
    logger.error(error, `[${reference}] Failed to update credit agentId = ${agentId}, userId = ${userId}, credit: ${credit}`)
    error.logged = true
    throw error
  }
}

const getCommissionConfig = async function (server, gameId, agentId) {
  const cacheName = `comm-${gameId}-${agentId}`
  const cached = await server.methods.getCache(cacheName)
  if (cached) {
    return cached.data
  }

  const data = await Commission.getConfig(gameId, agentId)
  if (_.isEmpty(data)) {
    throw new Error(`No commission agentId: ${agentId}, gameId: ${gameId}`)
  }
  await server.methods.setCache(cacheName, data)
  return data
}

const isTransactionDuplicate = async function (transId) {
  const count = await Transaction.countByTransId(transId)
  return count !== 0
}

const isTransDuplicate = async function (transId) {
  const count = await Transaction.countByTransacByTxnId(transId)
  return count !== 0
}

const saveTransaction = async function (server, txn, action, userId, agentId) {
  txn['action'] = action
  txn['userId'] = userId
  txn['agentId'] = agentId

  // Get commission config
  const commConfig = await getCommissionConfig(server, config.get('app.gameId'), agentId)
  txn['percent_user_commission'] = commConfig['percent_user_commission']
  txn['percent_agent_share'] = commConfig['percent_agent_share']
  txn['percent_agent_commission_share'] = commConfig['percent_agent_commission_share']

  const transaction = new Transaction(txn)
  const res = await Transaction.create(transaction)
  return res['id']
}

// Get last transaction with round id
const getLastTransByRoundId = async function (round_id) {
  let lastTransaction = await Transaction.findLastTransactionByRound(round_id);
  return lastTransaction[0];
};

// Get last transaction with txns id
const getLastTransById = async function (transaction_id) {
  let lastTransaction = await Transaction.findLastTransactionById(transaction_id);
  return lastTransaction[0];
};


module.exports = {
  getSerialNo,
  loginAndLaunchGame,
  listGames,
  getAgent,
  getUser,
  getCredit,
  updateCredit,
  getCommissionConfig,
  isTransactionDuplicate,
  isTransDuplicate,
  saveTransaction,
  getLastTransByRoundId,
  getLastTransById
}
