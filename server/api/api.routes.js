"use strict";

const handler = require("./api.handler");
const validations = require("./api.validations");

const API_PREFIX = "/callback";

const routes = [
  {
    path: `/api/list-games`,
    method: "GET",
    handler: handler.listGames,
    config: {
      auth: false,
      tags: ["api"],
      validate: validations.listGames,
      pre: [{ method: handler.validateToken, assign: "body" }],
    },
  },
  {
    path: "/api/launchgame",
    method: "GET",
    handler: handler.loginAndLaunchGame,
    config: {
      notes: "Launch I8 Gaming game",
      auth: false,
      tags: ["api"],
      validate: validations.launchgame,
      pre: [{ method: handler.validateToken, assign: "body" }],
    },
  },
  {
    path: `${API_PREFIX}/checkBalance`,
    method: "POST",
    handler: handler.checkBalance,
    config: {
      auth: false,
      tags: ["api"],
      pre: [{ method: handler.parseBody, assign: "body" }],
    },
  },
  {
    path: `${API_PREFIX}/placeBets`,
    method: "POST",
    handler: handler.placeBets,
    config: {
      auth: false,
      tags: ["api"],
      pre: [{ method: handler.parseBody, assign: "body" }],
    },
  },
  {
    path: `${API_PREFIX}/settleBets`,
    method: "POST",
    handler: handler.settleBets,
    config: {
      auth: false,
      tags: ["api"],
      pre: [{ method: handler.parseBody, assign: "body" }],
    },
  },
  {
    path: `${API_PREFIX}/cancelBets`,
    method: "POST",
    handler: handler.cancelBets,
    config: {
      auth: false,
      tags: ["api"],
      pre: [{ method: handler.parseBody, assign: "body" }],
    },
  },
  {
    path: `${API_PREFIX}/winRewards`,
    method: "POST",
    handler: handler.winRewards,
    config: {
      auth: false,
      tags: ["api"],
      pre: [{ method: handler.parseBody, assign: "body" }],
    },
  },
  {
    path: `${API_PREFIX}/voidBets`,
    method: "POST",
    handler: handler.voidBets,
    config: {
      auth: false,
      tags: ["api"],
      pre: [{ method: handler.parseBody, assign: "body" }],
    },
  }
];

module.exports = routes;
