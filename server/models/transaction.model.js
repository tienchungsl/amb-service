const { execute, query } = require("../utils/db");

// constructor
const Transaction = function (transaction) {
  const currentDate = new Date();
  this.agent_id = transaction["agentId"];
  this.user_id = transaction["userId"];
  this.trans_action = transaction["action"];
  this.trans_date = Math.floor(currentDate.getTime() / 1000);
  this.transfer_id = transaction["transferId"] || 0.0;
  this.transaction_id = transaction["transactionId"] || 0.0;
  this.round_id = transaction["roundId"] || 0.0;
  this.playInfo = transaction["playInfo"] || 0.0;
  this.gameCode = transaction["gameCode"];
  this.turn_over = transaction["turnOver"]
  this.isEndRound = transaction["isEndRound"] || 0.0;
  this.bet_amount = transaction["betAmount"] || 0.0;
  this.win_amount = transaction["winAmount"] || 0.0;
  this.create_date = currentDate;
  this.percent_user_commission = transaction["percent_user_commission"] || 0.0;
  this.percent_agent_share = transaction["percent_agent_share"] || 0.0;
  this.percent_agent_commission_share =
    transaction["percent_agent_commission_share"] || 0.0;
};

Transaction.create = (newTransaction) => {
  return new Promise((resolve, reject) => {
    execute(
      "INSERT INTO amb_i8_transaction SET ?",
      newTransaction,
      (err, res) => {
        if (err) {
          return reject(err);
        }

        return resolve({ id: res.insertId, ...newTransaction });
      }
    );
  });
};

Transaction.countByTransId = (transId) => {
  return new Promise((resolve, reject) => {
    query(
      `SELECT count(1) AS Count FROM amb_i8_transaction WHERE transfer_id = ?`,
      [transId],
      (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res[0].Count);
      }
    );
  });
};

Transaction.countByTransacByTxnId = (transId) => {
  return new Promise((resolve, reject) => {
    query(
      `SELECT count(1) AS Count FROM amb_i8_transaction WHERE transaction_id = ?`,
      [transId],
      (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res[0].Count);
      }
    );
  });
};

Transaction.findByRoundId = (roundId) => {
  return new Promise((resolve, reject) => {
    query(
      `SELECT id, trans_action, transfer_id, transaction_id, round_id, bet_amount, isEndRound FROM amb_i8_transaction 
      WHERE round_id = ?`,
      [roundId],
      (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res);
      }
    );
  });
};

Transaction.findLastTransactionByRound = (roundId) => {
  return new Promise((resolve, reject) => {
    query(
      `SELECT id, trans_action, transfer_id, round_id, bet_amount, win_amount, isEndRound FROM amb_i8_transaction
       WHERE round_id = ? ORDER BY id DESC LIMIT 1`,
      [roundId],
      (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res);
      }
    );
  });
};

Transaction.findLastTransactionById = (transaction_id) => {
  return new Promise((resolve, reject) => {
    query(
      `SELECT id, trans_action, transfer_id, transaction_id, round_id, bet_amount, win_amount, isEndRound FROM amb_i8_transaction
       WHERE transaction_id = ? ORDER BY id DESC LIMIT 1`,
      [transaction_id],
      (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res);
      }
    );
  });
};

module.exports = Transaction;
