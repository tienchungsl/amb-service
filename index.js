'use strict'

const Hapi = require('@hapi/hapi')
const config = require('config')

const routes = require('./routes')
const plugins = require('./plugins')
const logger = require('./server/utils/logger')

const server = new Hapi.Server({
  port: process.env.PORT || config.get('app.port')
})

const gracefulStopServer = function () {
  // Wait 10 secs for existing connection to close and then exit.
  server.stop({timeout: 10 * 1000}, () => {
    logger.info('Shutting down server')
    process.exit(0)
  })
}

process.on('uncaughtException', err => {
  logger.error(err, 'Uncaught exception')
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error({
    promise: promise,
    reason: reason
  }, 'unhandledRejection')
  process.exit(1)
})

process.on('SIGINT', gracefulStopServer)
process.on('SIGTERM', gracefulStopServer)

const validate = async function (decoded, request, h) {
  if (decoded['userId'] !== undefined && decoded['agentId'] !== undefined) {
    return { isValid: true }
  } else {
    return { isValid: false }
  }
}

// Caching
const Cache = server.cache({ segment: 'share', expiresIn: 60 * 60 * 1000 })

const setCache = async function (key, data) {
  await Cache.set(key, { data })
}

const getCache = async function (key) {
  const cached = await Cache.get(key)
  return cached
}

const dropCache = async function (key) {
  await Cache.drop(key)
}

server.method('setCache', setCache)
server.method('getCache', getCache)
server.method('dropCache', dropCache)

/**
 * Starts the server
 * @returns {Promise.<void>}
 */
const startServer = async function () {
  try {
    // attach plugins here
    await server.register(plugins)

    server.auth.strategy('jwt', 'jwt', {
      key: config.get('auth.secretKey'),
      validate
    })

    server.auth.default('jwt')

    // attach routes here
    server.route(routes)

    await server.start()
    logger.info(`server started at port: ${config.get('app.port')} with env: ${config.util.getEnv('NODE_ENV')}`)
  } catch (error) {
    logger.error(error)
    process.exit(1)
  }
}

startServer()
