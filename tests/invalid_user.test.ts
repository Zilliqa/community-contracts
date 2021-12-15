import { Zilliqa } from "@zilliqa-js/zilliqa";
import fs from "fs";
import { getAddressFromPrivateKey, schnorr } from "@zilliqa-js/crypto";

import { getJSONParams, getErrorMsg } from "./testutil";

import {
  API,
  TX_PARAMS,
  CONTRACTS,
  FAUCET_PARAMS,
  asyncNoop,
  STAKING_ERROR,
} from "./config";

const JEST_WORKER_ID = Number(process.env["JEST_WORKER_ID"]);
const GENESIS_PRIVATE_KEY = global.GENESIS_PRIVATE_KEYS[JEST_WORKER_ID - 1];

const zilliqa = new Zilliqa(API);
zilliqa.wallet.addByPrivateKey(GENESIS_PRIVATE_KEY);

let globalStakingContractAddress;
let globalToken0ContractAddress;
let globalToken1ContractAddress;
let globalToken2ContractAddress;

let globalTestAccounts: Array<{
  privateKey: string;
  address: string;
}> = [];

const OWNER = 0;
const USER = 1;

const getTestAddr = (index) => globalTestAccounts[index]!.address as string;

beforeAll(async () => {
  let contract;
  const accounts = Array.from({ length: 2 }, schnorr.generatePrivateKey).map(
    (privateKey) => ({
      privateKey,
      address: getAddressFromPrivateKey(privateKey),
    })
  );

  for (const { privateKey, address } of accounts) {
    zilliqa.wallet.addByPrivateKey(privateKey);
    const tx = await zilliqa.blockchain.createTransaction(
      zilliqa.transactions.new(
        {
          ...FAUCET_PARAMS,
          toAddr: address,
        },
        false
      )
    );
    if (!tx.getReceipt()!.success) {
      throw new Error();
    }
  }
  globalTestAccounts = accounts;

  console.table({
    GENESIS_PRIVATE_KEY,
    OWNER: getTestAddr(OWNER),
    USER: getTestAddr(USER),
  });

  const init0 = getJSONParams({
    _scilla_version: ["Uint32", 0],
    contract_owner: ["ByStr20", getTestAddr(OWNER)],
    name: ["String", CONTRACTS.token0.name],
    symbol: ["String", CONTRACTS.token0.symbol],
    decimals: ["Uint32", CONTRACTS.token0.decimals],
    init_supply: ["Uint128", CONTRACTS.token0.init_supply],
  });

  [, contract] = await zilliqa.contracts
    .new(fs.readFileSync(CONTRACTS.token0.path).toString(), init0)
    .deploy(TX_PARAMS, 33, 1000, true);
  globalToken0ContractAddress = contract.address;

  const init1 = getJSONParams({
    _scilla_version: ["Uint32", 0],
    contract_owner: ["ByStr20", getTestAddr(OWNER)],
    name: ["String", CONTRACTS.token1.name],
    symbol: ["String", CONTRACTS.token1.symbol],
    decimals: ["Uint32", CONTRACTS.token1.decimals],
    init_supply: ["Uint128", CONTRACTS.token1.init_supply],
  });

  [, contract] = await zilliqa.contracts
    .new(fs.readFileSync(CONTRACTS.token1.path).toString(), init1)
    .deploy(TX_PARAMS, 33, 1000, true);
  globalToken1ContractAddress = contract.address;

  const init2 = getJSONParams({
    _scilla_version: ["Uint32", 0],
    contract_owner: ["ByStr20", getTestAddr(OWNER)],
    name: ["String", CONTRACTS.token2.name],
    symbol: ["String", CONTRACTS.token2.symbol],
    decimals: ["Uint32", CONTRACTS.token2.decimals],
    init_supply: ["Uint128", CONTRACTS.token2.init_supply],
  });

  [, contract] = await zilliqa.contracts
    .new(fs.readFileSync(CONTRACTS.token2.path).toString(), init2)
    .deploy(TX_PARAMS, 33, 1000, true);
  globalToken2ContractAddress = contract.address;

  const init3 = getJSONParams({
    _scilla_version: ["Uint32", 0],
    init_contract_owner: ["ByStr20", getTestAddr(OWNER)],
    init_staking_token_address: ["ByStr20", globalToken0ContractAddress],
    blocks_per_cycle: ["Uint256", "10"],
    token_addr: ["ByStr20", globalToken2ContractAddress],
    token_rewards: ["Uint128", "10000000000000"],
  });

  [, contract] = await zilliqa.contracts
    .new(fs.readFileSync(CONTRACTS.staking_contract.path).toString(), init3)
    .deploy(TX_PARAMS, 33, 1000, true);
  globalStakingContractAddress = contract.address;

  console.table({
    token0: globalToken0ContractAddress,
    token1: globalToken1ContractAddress,
    token2: globalToken2ContractAddress,
    staking: globalStakingContractAddress,
  });

  zilliqa.wallet.setDefault(getTestAddr(OWNER));
  const tx0: any = await zilliqa.contracts.at(globalToken0ContractAddress).call(
    "IncreaseAllowance",
    getJSONParams({
      spender: ["ByStr20", globalStakingContractAddress],
      amount: ["Uint128", 100000000000000],
    }),
    TX_PARAMS
  );
  if (!tx0.receipt.success) {
    throw new Error();
  }

  const tx1: any = await zilliqa.contracts.at(globalToken1ContractAddress).call(
    "IncreaseAllowance",
    getJSONParams({
      spender: ["ByStr20", globalStakingContractAddress],
      amount: ["Uint128", 100000000000000],
    }),
    TX_PARAMS
  );
  if (!tx1.receipt.success) {
    throw new Error();
  }

  const tx2: any = await zilliqa.contracts.at(globalToken2ContractAddress).call(
    "IncreaseAllowance",
    getJSONParams({
      spender: ["ByStr20", globalStakingContractAddress],
      amount: ["Uint128", 100000000000000],
    }),
    TX_PARAMS
  );
  if (!tx2.receipt.success) {
    throw new Error();
  }

  const tx3: any = await zilliqa.contracts
    .at(globalStakingContractAddress)
    .call(
      "update_token_rewards",
      getJSONParams({
        token_address: ["ByStr20", globalToken1ContractAddress],
        amount_per_cycle: ["Uint128", 10000000000000],
      }),
      TX_PARAMS
    );
  if (!tx3.receipt.success) {
    throw new Error();
  }

  const tx5: any = await zilliqa.contracts.at(globalToken1ContractAddress).call(
    "Transfer",
    getJSONParams({
      to: ["ByStr20", globalStakingContractAddress],
      amount: ["Uint128", 1000000000000000],
    }),
    TX_PARAMS
  );
  if (!tx5.receipt.success) {
    throw new Error();
  }

  const tx6: any = await zilliqa.contracts.at(globalToken2ContractAddress).call(
    "Transfer",
    getJSONParams({
      to: ["ByStr20", globalStakingContractAddress],
      amount: ["Uint128", 1000000000000000],
    }),
    TX_PARAMS
  );
  if (!tx6.receipt.success) {
    throw new Error();
  }
});

describe("staking contract", () => {
  const testCases = [
    {
      name: "withdraw without depositing",
      transition: "withdraw",
      getSender: () => getTestAddr(OWNER),
      getParams: () => ({}),
      beforeTransition: asyncNoop,
      error: STAKING_ERROR.InvalidUser,
    },
    {
      name: "withdraw by loss without depositing",
      transition: "withdraw_by_loss",
      getSender: () => getTestAddr(OWNER),
      getParams: () => ({}),
      beforeTransition: asyncNoop,
      error: STAKING_ERROR.InvalidUser,
    },
    {
      name: "claim without depositing",
      transition: "claim",
      getSender: () => getTestAddr(OWNER),
      getParams: () => ({}),
      beforeTransition: asyncNoop,
      error: STAKING_ERROR.InvalidUser,
    },
  ];

  for (const testCase of testCases) {
    it(`${testCase.transition}: ${testCase.name}`, async () => {
      await testCase.beforeTransition();

      zilliqa.wallet.setDefault(testCase.getSender());
      const tx: any = await zilliqa.contracts
        .at(globalStakingContractAddress)
        .call(
          testCase.transition,
          getJSONParams(testCase.getParams()),
          TX_PARAMS
        );
      console.log("transaction id = ", tx.id);
      if (testCase.error === undefined) {
        if (!tx.receipt.success) {
          throw new Error();
        }
      } else {
        expect(tx.receipt.exceptions[0].message).toBe(
          getErrorMsg(testCase.error)
        );
      }
    });
  }
});
