"use strict";

const boom = require("@hapi/boom");
const httpStatus = require("http-status");
const config = require("config");
const _ = require("lodash");
const jwt = require("jsonwebtoken");
const jwt_decode = require("jwt-decode");

const service = require("./api.service");
const logger = require("../utils/logger");
const Transaction = require("../models/transaction.model");
const Agent = require("../models/agent.model");

const ACTION = {
  OPEN: "OPEN",
  SETTLED: "SETTLED",
  REFUND: "REFUND",
  BONUS: "BONUS",
  UNSETTLED: "UNSETTLED",
  VOID: "VOID",
};

const ERROR = {
  SUCCESS: { CODE: 0, MESSAGE: "Success" },
  USER_NOT_FOUND: { CODE: 10001, MESSAGE: "User not found" },
  INSUFFICIENT_BALANCE: {
    CODE: 10002,
    MESSAGE: "User has insufficient balance to proceed",
  },
  TRANSACTION_NOT_FOUND: { CODE: 20001, MESSAGE: "Transaction not found" },
  TRANSACTION_DUPLICATE: { CODE: 20002, MESSAGE: "Transaction duplicate" },
  BET_ALREADY_CANCELED: { CODE: 20003, MESSAGE: "Bet has already canceled" },
  BET_ALREADY_SETTLED: { CODE: 20004, MESSAGE: "Bet has already settled" },
  INVALID_TOKEN: { CODE: 30001, MESSAGE: "Invalid token" },
  FORBIDDEN_REQUEST: { CODE: 40003, MESSAGE: "Forbidden request" },
  INTERNAL_SERVER_ERROR: { CODE: 50001, MESSAGE: "Internal server error" },
};

const getUserId = function (data) {
  const datas = data.match(/^([a-z|A-Z]{1,10})(\d{4})(.+)$/);
  var agentId = null;
  var userId = null;
  if (datas && datas.length === 4) {
    agentId = datas[2];
    userId = datas[3];
  }
  return { agentId, userId };
};

/** Callback */
const parseBody = async function (req, h) {
  let response = { isError: true, error: {} };

  const { username } = req.payload;
  try {
    const userData = getUserId(username);

    if (_.isEmpty(userData.agentId) || _.isEmpty(userData.userId)) {
      response.error = ERROR.INVALID_TOKEN;
      return response;
    }

    let agentId = userData.agentId;
    let userId = userData.userId;
    const agentData = await Agent.findById(agentId);
    if (_.isEmpty(agentData)) {
      response.error = ERROR.INVALID_TOKEN;
      return response;
    }

    response.isError = false;
    response["agentPrefix"] = agentData.agent_prefix;
    response["agentId"] = Number(agentId);
    response["userId"] = userId;
    return response;
  } catch (error) {
    response.error = ERROR.INVALID_TOKEN;
    const errorMessage = "Failed parse request body";
    logger.error(error, errorMessage);
    return response;
  }
};

const validateToken = async function (req, h) {
  try {
    const token = req.headers["authorization"];
    let decoded = jwt_decode(token);
    if (decoded["userId"] === undefined || decoded["agentId"] === undefined) {
      throw new Error("Invalid token data");
    }

    // Get game key from agent
    const agentData = await Agent.findById(decoded["agentId"]);
    if (_.isEmpty(agentData)) {
      throw new Error("Invalid agent data");
    }
    const gameKey = agentData["game_key"] || config.get("auth.secretKey");
    decoded = jwt.verify(token, gameKey);

    return decoded;
  } catch (error) {
    const errorMessage = "Invalid token";
    logger.error(error, errorMessage);
    return boom.boomify(error, {
      statusCode: httpStatus.UNAUTHORIZED,
      message: errorMessage,
    });
  }
};

/* Response */
const response = function (
  id,
  statusCode,
  timestampMillis,
  productId,
  currency,
  balanceBefore,
  balanceAfter,
  username
) {
  return {
    id: id,
    statusCode: statusCode,
    productId: productId,
    timestampMillis: timestampMillis,
    username: username,
    currency: currency,
    balanceBefore: balanceBefore,
    balanceAfter: balanceAfter,
  };
};

const responseDuplicate = function (
  id,
  statusCode,
  productId,
  balance,
  timestampMillis
) {
  return {
    id: id,
    statusCode: statusCode,
    productId: productId,
    balance: balance,
    timestampMillis: timestampMillis,
  };
};

const responseError = function (error) {
  let response = { Error: error.CODE, Description: error.MESSAGE };
  return response;
};

const loginAndLaunchGame = async function (req, h) {
  const { userId, agentId } = req.pre.body;
  const { gameCode, isMobile } = req.query;
  try {
    const agentData = await Agent.findById(agentId);
    const agentPrefix = agentData.agent_prefix;
    const paddingAgentId = _.padStart(agentId, 4, "0");
    const username = `${agentPrefix}${paddingAgentId}${userId}`.toLowerCase();
    const authSecretKey = config.get("auth.secretKey");
    const redirectUrl = await service.loginAndLaunchGame(
      agentId,
      userId,
      authSecretKey,
      gameCode,
      username,
      isMobile
    );
    return { statusCode: httpStatus.OK, redirectUrl };
  } catch (error) {
    const errorMessage = "Failed to login and launchgame";
    !error.logged && logger.error(error, errorMessage);
    return boom.boomify(error, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      message: errorMessage,
    });
  }
};

const listGames = async function (req, h) {
  try {
    const data = await service.listGames();
    return { statusCode: httpStatus.OK, data };
  } catch (error) {
    const errorMessage = "Failed to get game list";
    !error.logged && logger.error(error, errorMessage);
    return boom.boomify(error, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      message: errorMessage,
    });
  }
};

const checkBalance = async function (req, h) {
  try {
    const data = req.payload;
    const body = req.pre.body;

    if (body.isError) {
      return responseError(ERROR.INVALID_TOKEN);
    }

    const { agentId, userId } = body;
    const credit = await service.getCredit(req.server, agentId, userId);

    return {
      id: data.id,
      username: data.username,
      currency: data.currency,
      timestampMillis: data.timestampMillis,
      balance: credit,
      productId: data.productId,
      statusCode: ERROR.SUCCESS.CODE,
    };
  } catch (error) {
    const errorMessage = "Failed to callback balance";
    !error.logged && logger.error(error, errorMessage);
    return responseError(ERROR.INTERNAL_SERVER_ERROR);
  }
};

const placeBets = async function (req, h) {
  try {
    const data = req.payload;
    const { id, productId, username, currency, timestampMillis, txns } = data;
    const txnsInfor = txns[0];

    // check body request
    const body = req.pre.body;
    if (body.isError) {
      return responseError(ERROR.INVALID_TOKEN);
    }

    // Get balance from user
    const { agentId, userId } = body;
    let credit = await service.getCredit(req.server, agentId, userId);
    let updateCredit = 0.0;
    let betAmount = parseFloat(txnsInfor.betAmount);
    let balanceBefore = credit;
    let balanceAfter = credit;

    // Check duplicate transaction
    const isDuplicateId = await service.isTransactionDuplicate(id);
    const lastTrans = await service.getLastTransById(txnsInfor.txnId);
    const txnLastRound = await service.getLastTransByRoundId(txnsInfor.roundId);
    if (
      isDuplicateId ||
      (lastTrans?.trans_action === ACTION.OPEN &&
        txnLastRound?.trans_action === ACTION.OPEN)
    ) {
      return responseDuplicate(
        id,
        ERROR.TRANSACTION_DUPLICATE.CODE,
        productId,
        credit,
        timestampMillis
      );
    }

    // check the round has cancel bet will not update balance
    if (_.isEmpty(lastTrans) || lastTrans?.trans_action !== ACTION.REFUND) {
      // update balance
      if (betAmount > 0) {
        credit -= betAmount;
        updateCredit -= betAmount;
      } else {
        credit += betAmount;
        updateCredit += betAmount;
      }
      balanceAfter = credit;
    }

    // check insufficent blance
    if (credit - betAmount < 0) {
      return {
        id: id,
        statusCode: ERROR.INSUFFICIENT_BALANCE.CODE,
        productId: productId,
        balance: credit,
        timestampMillis: timestampMillis,
      };
    }

    // update credit and save transaction to database
    updateData(data, id, txnsInfor);
    await updateDB(req, agentId, userId, updateCredit, data, ACTION.OPEN);

    return response(
      id,
      ERROR.SUCCESS.CODE,
      timestampMillis,
      productId,
      currency,
      balanceBefore,
      balanceAfter,
      username
    );
  } catch (error) {
    const errorMessage = "Failed to callback bonus";
    !error.logged && logger.error(error, errorMessage);
    return responseError(ERROR.INTERNAL_SERVER_ERROR);
  }
};

const settleBets = async function (req, h) {
  try {
    const data = req.payload;
    const { id, productId, username, currency, timestampMillis, txns } = data;
    const txnsInfor = txns[0];

    // check body request
    const body = req.pre.body;
    if (body.isError) {
      return responseError(ERROR.INVALID_TOKEN);
    }

    const { agentId, userId } = body;
    let credit = await service.getCredit(req.server, agentId, userId);
    let updateCredit = 0.0;
    let balanceBefore = credit;
    let balanceAfter = credit;
    let betAmount = parseFloat(txnsInfor.betAmount);
    let payoutAmount = 0;

    // Check duplicate transaction
    const isDuplicateId = await service.isTransactionDuplicate(id);
    const lastTrans = await service.getLastTransById(txnsInfor.txnId);
    const txnLastRound = await service.getLastTransByRoundId(txnsInfor.roundId);
    if (
      isDuplicateId ||
      (lastTrans?.trans_action === ACTION.SETTLED &&
        txnLastRound?.trans_action === ACTION.SETTLED)
    ) {
      return responseDuplicate(
        id,
        ERROR.TRANSACTION_DUPLICATE.CODE,
        productId,
        credit,
        timestampMillis
      );
    }

    // check insufficent blance
    if (credit - betAmount < 0) {
      return {
        id: id,
        statusCode: ERROR.INSUFFICIENT_BALANCE.CODE,
        productId: productId,
        timestampMillis: timestampMillis,
      };
    }

    // get all transaction of the round
    const txnsAll = await Transaction.findByRoundId(txnsInfor.roundId);
    const txnsVoid = txnsAll.filter((txn) => txn.trans_action === ACTION.VOID);
    const txnsUnsettled = txnsAll.filter((txn) => txn.trans_action === ACTION.UNSETTLED);

    const txnsCancel = txnsAll.filter(
      (txn) => txn.trans_action === ACTION.REFUND
    );

    // Check canceled bet transaction
    if (!_.isEmpty(txnsCancel) && _.isEmpty(txnsUnsettled)) {
      return {
        id: id,
        statusCode: ERROR.BET_ALREADY_CANCELED.CODE,
        productId: productId,
        balance: credit,
        timestampMillis: timestampMillis,
      };
    }

    // check transaction has cancel bet
    if (_.isEmpty(txnsVoid) && _.isEmpty(txnsCancel)) {
      // update balance
      for (let txn of txns) {
        betAmount = parseFloat(txn.betAmount);
        payoutAmount = parseFloat(txn.payoutAmount);
        credit += payoutAmount - betAmount;
        updateCredit += payoutAmount - betAmount;
      }
      balanceAfter = credit;
    }

    // update credit and save transaction to database
    updateData(data, id, txnsInfor);
    await updateDB(req, agentId, userId, updateCredit, data, ACTION.SETTLED);

    return response(
      id,
      ERROR.SUCCESS.CODE,
      timestampMillis,
      productId,
      currency,
      balanceBefore,
      balanceAfter,
      username
    );
  } catch (error) {
    const errorMessage = "Failed to callback bonus";
    !error.logged && logger.error(error, errorMessage);
    return responseError(ERROR.INTERNAL_SERVER_ERROR);
  }
};

const unsettleBets = async function (req, h) {
  try {
    const data = req.payload;
    const { id, productId, username, currency, timestampMillis, txns } = data;
    const txnsInfor = txns[0];

    // check body request
    const body = req.pre.body;
    if (body.isError) {
      return responseError(ERROR.INVALID_TOKEN);
    }

    // get credit from user
    const { agentId, userId } = body;
    let credit = await service.getCredit(req.server, agentId, userId);
    let updateCredit = 0.0;
    let betAmount = parseFloat(txnsInfor.betAmount);
    let balanceBefore = credit;
    let balanceAfter = credit;

    // Check duplicate transaction
    const isDuplicateId = await service.isTransactionDuplicate(id);
    const lastTrans = await service.getLastTransById(txnsInfor.txnId);
    const txnLastRound = await service.getLastTransByRoundId(txnsInfor.roundId);
    if (
      isDuplicateId ||
      (lastTrans?.trans_action === ACTION.SETTLED &&
        txnLastRound?.trans_action === ACTION.SETTLED)
    ) {
      return responseDuplicate(
        id,
        ERROR.TRANSACTION_DUPLICATE.CODE,
        productId,
        credit,
        timestampMillis
      );
    }

    // get last transaction of the round
    const txn = await service.getLastTransByRoundId(txnsInfor.roundId);
    if (txn) {
      txn.trans_action == ACTION.SETTLED
        ? (betAmount = txn.win_amount)
        : (betAmount = txn.bet_amount);
    } else {
      return responseDuplicate(
        id,
        ERROR.TRANSACTION_NOT_FOUND.CODE,
        productId,
        credit,
        timestampMillis
      );
    }

    // update balance
    if (betAmount > 0) {
      credit -= betAmount;
      updateCredit -= betAmount;
      balanceAfter = credit;
    }

    // update credit and save transaction to database
    updateData(data, id, txnsInfor);
    await updateDB(req, agentId, userId, updateCredit, data, ACTION.UNSETTLED);

    return response(
      id,
      ERROR.SUCCESS.CODE,
      timestampMillis,
      productId,
      currency,
      balanceBefore,
      balanceAfter,
      username
    );
  } catch (error) {
    const errorMessage = "Failed to callback bonus";
    !error.logged && logger.error(error, errorMessage);
    return responseError(ERROR.INTERNAL_SERVER_ERROR);
  }
};

const cancelBets = async function (req, h) {
  try {
    const data = req.payload;
    const { id, productId, username, currency, timestampMillis, txns } = data;
    const txnsInfor = txns[0];

    // check body request
    const body = req.pre.body;
    if (body.isError) {
      return responseError(ERROR.INVALID_TOKEN);
    }

    // get credit from user
    const { agentId, userId } = body;
    let credit = await service.getCredit(req.server, agentId, userId);
    let updateCredit = 0.0;
    let balanceBefore = credit;
    let balanceAfter = credit;
    let betAmount = parseFloat(txnsInfor.betAmount);

    // check duplicate transaction
    const isDuplicateId = await service.isTransactionDuplicate(id);
    const lastTrans = await service.getLastTransById(txnsInfor.txnId);
    const txnLastRound = await service.getLastTransByRoundId(txnsInfor.roundId);
    if (
      isDuplicateId ||
      (lastTrans?.trans_action === ACTION.REFUND &&
        txnLastRound?.trans_action === ACTION.REFUND)
    ) {
      return responseDuplicate(
        id,
        ERROR.TRANSACTION_DUPLICATE.CODE,
        productId,
        credit,
        timestampMillis
      );
    }

    // Get all transaction of the round
    let txnsAll = await Transaction.findByRoundId(txnsInfor.roundId);
    const txnsSettled = txnsAll.filter(
      (item) => item.trans_action === ACTION.SETTLED
    );
    const txnsUnsettled = txnsAll.filter(
      (item) => item.trans_action === ACTION.UNSETTLED
    );

    // check transaction has settled
    if (txnsSettled.length && !txnsUnsettled.length) {
      return {
        id: id,
        statusCode: ERROR.BET_ALREADY_SETTLED.CODE,
        productId: productId,
        balance: credit,
        timestampMillis: timestampMillis,
      };
    }

    // check the transaction exits
    if (!_.isEmpty(lastTrans)) {
      if (lastTrans.trans_action === ACTION.OPEN) {
        betAmount = lastTrans.bet_amount;
      }
      // update balance
      if (betAmount > 0) {
        credit += betAmount;
        updateCredit += betAmount;
        balanceAfter = credit;
      }
    }

    // update credit and save transaction to database
    updateData(data, id, txnsInfor);
    await updateDB(req, agentId, userId, updateCredit, data, ACTION.REFUND);

    return response(
      id,
      ERROR.SUCCESS.CODE,
      timestampMillis,
      productId,
      currency,
      balanceBefore,
      balanceAfter,
      username
    );
  } catch (error) {
    const errorMessage = "Failed to callback bonus";
    !error.logged && logger.error(error, errorMessage);
    return responseError(ERROR.INTERNAL_SERVER_ERROR);
  }
};

const winRewards = async function (req, h) {
  try {
    const data = req.payload;
    const { id, productId, username, currency, timestampMillis, txns } = data;
    const txnsInfor = txns[0];

    // check body request
    const body = req.pre.body;
    if (body.isError) {
      return responseError(ERROR.INVALID_TOKEN);
    }

    //get User balance
    const { agentId, userId } = body;
    let credit = await service.getCredit(req.server, agentId, userId);
    let updateCredit = 0.0;
    let payoutAmount = parseFloat(txnsInfor.payoutAmount);
    let balanceBefore = credit;
    let balanceAfter = credit;

    // check duplicate transaction

    const isDuplicateId = await service.isTransactionDuplicate(id);
    const lastTrans = await service.getLastTransById(txnsInfor.txnId);
    const txnLastRound = await service.getLastTransByRoundId(txnsInfor.roundId);
    if (
      isDuplicateId ||
      (lastTrans?.trans_action === ACTION.OPEN &&
        txnLastRound?.trans_action === ACTION.OPEN)
    ) {
      return responseDuplicate(
        id,
        ERROR.TRANSACTION_DUPLICATE.CODE,
        productId,
        credit,
        timestampMillis
      );
    }

    // update balance
    credit += payoutAmount;
    updateCredit += payoutAmount;
    balanceAfter = credit;

    // update credit and save transaction to database
    updateData(data, id, txnsInfor);
    await updateDB(req, agentId, userId, updateCredit, data, ACTION.BONUS);

    return response(
      id,
      ERROR.SUCCESS.CODE,
      timestampMillis,
      productId,
      currency,
      balanceBefore,
      balanceAfter,
      username
    );
  } catch (error) {
    const errorMessage = "Failed to callback winRewards";
    !error.logged && logger.error(error, errorMessage);
    return responseError(ERROR.INTERNAL_SERVER_ERROR);
  }
};

const voidBets = async function (req, h) {
  try {
    const data = req.payload;
    const { id, productId, username, currency, timestampMillis, txns } = data;
    const txnsInfor = txns[0];

    // check body request
    const body = req.pre.body;
    if (body.isError) {
      return responseError(ERROR.INVALID_TOKEN);
    }

    // Get balance from user
    const { agentId, userId } = body;
    let credit = await service.getCredit(req.server, agentId, userId);
    let updateCredit = 0.0;
    let betAmount = parseFloat(txnsInfor.betAmount);
    let payAmount = parseFloat(txnsInfor.payoutAmount);
    let balanceBefore = credit;
    let balanceAfter = credit;

    // check duplicate transaction
    const isDuplicateId = await service.isTransactionDuplicate(id);
    const lastTrans = await service.getLastTransById(txnsInfor.txnId);
    const txnLastRound = await service.getLastTransByRoundId(txnsInfor.roundId);
    if (
      isDuplicateId ||
      (lastTrans?.trans_action === ACTION.VOID &&
        txnLastRound?.trans_action === ACTION.VOID)
    ) {
      return responseDuplicate(
        id,
        ERROR.TRANSACTION_DUPLICATE.CODE,
        productId,
        credit,
        timestampMillis
      );
    }

    // check insufficent blance
    if (credit - betAmount < 0) {
      return {
        id: id,
        statusCode: ERROR.INSUFFICIENT_BALANCE.CODE,
        productId: productId,
        timestampMillis: timestampMillis,
      };
    }

    // check cancel does not match bet transaction
    if (!_.isEmpty(txnLastRound)) {
      // update balance
      credit += betAmount - payAmount;
      updateCredit += betAmount - payAmount;
      balanceAfter = credit;
    }

    // update credit and save transaction to database
    updateData(data, id, txnsInfor);
    await updateDB(req, agentId, userId, updateCredit, data, ACTION.VOID);

    return response(
      id,
      ERROR.SUCCESS.CODE,
      timestampMillis,
      productId,
      currency,
      balanceBefore,
      balanceAfter,
      username
    );
  } catch (error) {
    const errorMessage = "Failed to callback bonus";
    !error.logged && logger.error(error, errorMessage);
    return responseError(ERROR.INTERNAL_SERVER_ERROR);
  }
};

const updateData = function (data, id, txns) {
  data["transferId"] = id;
  data["transactionId"] = txns.id;
  data["roundId"] = txns.roundId;
  data["playInfo"] = txns.playInfo;
  data["winAmount"] = txns.payoutAmount;
  data["betAmount"] = txns.betAmount;
  data["gameCode"] = txns.gameCode;
  data["turnOver"] = txns.turnOver;
};

const updateDB = async function (
  req,
  agentId,
  userId,
  updateCredit,
  data,
  action
) {
  await service.updateCredit(
    req.server,
    agentId,
    userId,
    updateCredit,
    data["transferId"]
  );
  await service.saveTransaction(req.server, data, action, userId, agentId);
};

module.exports = {
  validateToken,
  loginAndLaunchGame,
  listGames,
  checkBalance,
  placeBets,
  settleBets,
  unsettleBets,
  cancelBets,
  winRewards,
  voidBets,
  parseBody,
};
