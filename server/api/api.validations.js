'use strict'

const Joi = require('joi')

const validations = {
  launchgame: {
    headers: Joi.object({
      Authorization: Joi.string().description('JWT Token')
    }).unknown(),
    query: Joi.object({
      gameCode: Joi.string().required().description('gamecode from list-games api')
    })
  },
  listGames: {
    headers: Joi.object({
      Authorization: Joi.string().description('JWT Token')
    }).unknown()
  }
}

module.exports = validations
