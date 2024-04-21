'use strict'

/**
 * Vendor modules
 */
const Inert = require('@hapi/inert')
const Vision = require('@hapi/vision')
const HapiSwagger = require('hapi-swagger')
const config = require('config')

/**
 * Internal modules
 */
const Package = require('./package.json')

const DEVELOPMENT = 'development'

/**
 * exports array of plugins with configuration.
 * @type {Array}
 */
let plugins = []

plugins.push(require('hapi-auth-jwt2'))

if (config.util.getEnv('NODE_ENV') === DEVELOPMENT) {

  // add hapi swagger integration
  plugins.push(Inert)
  plugins.push(Vision)
  plugins.push(
    {
      plugin: HapiSwagger,
      options: {
        info: {
          'title': Package.description,
          'version': Package.version
        },
        pathPrefixSize: 4
      }
    })
}

module.exports = plugins
