# Community Contracts

## Single Sided Asset Staking

Single Sided Asset Staking is locking up a fungible token and being returned an equal amount of "lk" tokens, representing the deposted or "staked" amount.

### Fungible Tokens

A ZRC-2 fungible token.

We will be calling Transfer/TransferTo and the respective allowance mechanism to move the fungible tokens into lk tokens.

### FungibleLockup.scilla

A ZRC-2 fungible token wrapper. Takes 'X' and returns 'lkX'

We will be calling Transfer/TransferTo and the respective allowance mechanism to move the lk fungible tokens into the staking contract.

### SingleSidedAssetStaking.scilla

A contract that takes a deposit of lk tokens, a deposit of reward tokens by the admin, and an epoch length.

The contract allows users to call deposit and be entered into a map called ```ssas_pool```, every amount of ```epoch_period_length``` a copy of ```ssas_pool``` is read into a larger nested map called ```past_snapshot_pool```, this snapshot captures the amount of each users liquidity at a particular block.

```ocaml
type UserSSAS  =  | UserSSAS of BNum    (* block entered staking *)
                                Uint128 (* deposited lktokens *)
```

When users data is stored onchain, we store the block they entered (or re-entered) the staking contract, and when they claim for a particular epoch, we check the deposit block time plus the epoch length and check that against the current time, meaning they cannot claim for past epochs.

When users have claimed for longer than an epoch amount of blocks, on the next snapshot, they will be eligible for rewards. When a user claims, they claim for a specific snapshotID which increments from zero.

When users successfully claim for an snapshot they are found in, and previously haven't claimed for, the row is found and their amount of staked tokens is returned. The total amount of staked tokens is also returned from the pool. From here we can calculate a percentage of the immutable ```immutable_reward_per_epoch``` and send this calculated amount to the ```reward_token_contract``` with the caller as the recipient of the reward tokens the contract holds from the admin depositing. 

BUG : reward claim amount is wrong

## Testing

* DEPLOY FungibleToken.scilla as FT
* DEPLOY FungibleLockup.scilla as FL (FL)
* CALL FT.IncreaseAllowance(FL, 500)
* CALL FL.Lock(500)
* DEPLOY SingleSidedAssetStaking.scilla as SSAS(FL, REWARD_BYSTR20, TAX, EPOCH, REWARD_AMOUNT_PER_EPOCH)
Once the contract is deployed, any Deposit, Claim, Withdraw, AdminSendRewards, AdminReclaimTax will trigger an epoch when NOW >= time_to_take_snapshot
* CALL FL.IncreaseAllowance(SSAS,500)
* CALL SSAS.Deposit(1)
Now we have an entry in ```ssas_pool```, a tax block we want to leave after and no snapshot has been taken.
Our Deposit is 1
* ...time...
* CALL SSAS.Deposit(1)
* TRIGGERS SNAPSHOT sass => sass_copy(1)
Assuming we are not valid for this snapshot because we can't claim for a past epoch if your min stake time is less than now (you was in the past snapshot, but was never eligible)
Our Deposit is 2
For snapshot 1 our value is 1 (never valid)

* ...time...
* CALL SSAS.Deposit(1)
* TRIGGERS SNAPSHOT sass => sass_copy(2)
Our Deposit is 3
For snapshot 1 our value is 1 (never valid)
For snapshot 2 our value is 2 (valid)

* ...time...
* CALL SSAS.ClaimRewards(2)
Our Deposit is 3
For snapshot 2 our value is 2 (valid)
The total of the pool is 12
The total amount of rewards per snapshot is 100Z
Then our user owned percentage is 2/10 (20% / 0.2)
Then our rewards owed is 20Z

* ...time...
* CALL SSAS.Withdraw()
* TRIGGERS TAX IF user last deposit was (NOW-epoch_period_length) blocks ago for ```early_leave_tax``` amount of lktokens for Admin/ContractOwner

Assuming the map looks like the below example

And our wallet is 0xbC8543D12e2b7Cb2e1C7515C58462E509Ce2557a and we are claiming for epoch 6 we get a calculation that looks likes 

```user owned percentage / total of pool * amount of rewards per epoch```

So we hold 12.9% of the pool
If the rewards are 100z or 100000000000000qa
then we are owed 12.9Z

```https://devex.zilliqa.com/tx/8c2d0e766e6cfd0579869cbc801941ffd7db4c03d426fb3bb85e38c351c5428b?network=https://zilliqa-isolated-server.zilliqa.com/```

```json
"6": {
      "0x3aa56d1524910435ee644c5f8804d1dd645e5a5c": {
          "400747",
          "9"
      },
      "0xaf1b056d8c2bd18263e0f65339bd3d6cf208d9d7": {
          "400741",
          "3"
      },
      "0xbc8543d12e2b7cb2e1c7515c58462e509ce2557a": {
          "400777",
          "12" (you)
      },
      "0xcac62a2e4e42cced1f4e925108adc7cf22c1eee3": {
          "400757",
          "69"
      }
```

After we have claimed our block is wiped and we cannot reclaim any rewards

```https://devex.zilliqa.com/tx/ca6a4bf2d8c85c27476563cd62b17d45455e3b07d3749130043ed31bb31e4a02?network=https://zilliqa-isolated-server.zilliqa.com/```

The total is preserved to continued calculation of pool total size in the past snapshot.

```json
    "6": {
      "0x3aa56d1524910435ee644c5f8804d1dd645e5a5c": {
          "400747",
          "9"
      },
      "0xaf1b056d8c2bd18263e0f65339bd3d6cf208d9d7": {
          "400741",
          "3"
      },
      "0xbc8543d12e2b7cb2e1c7515c58462e509ce2557a": {
          "0",
          "12" (you)
      },
      "0xcac62a2e4e42cced1f4e925108adc7cf22c1eee3": {
          "400757",
          "69"
      }
    }
```

Notice our user wallet deposits 10 tokens and has a new balance of 22

```https://devex.zilliqa.com/tx/6320b462800ab6f98021046b4e51b038d89a91f7b311af7e5e30661e1d020dc7?network=https://zilliqa-isolated-server.zilliqa.com/```

If we left early we would lose 2 tokens due to 1000 bps (10%) tax

```https://devex.zilliqa.com/tx/25eb33a33b3b9cab28bb1b25036442e2f9b6bfd52e54a8ab8a819aa036eb3760?network=https://zilliqa-isolated-server.zilliqa.com/```

The admin could then reclaim the 2 tokens of tax

```https://devex.zilliqa.com/tx/d1c501fea38fe03d37d20eeeb05a4e2316417abcbcb8ffb26fd3f3a340318f46?network=https://zilliqa-isolated-server.zilliqa.com/```

a new snapshot occurs and the snapshot map for epoch 11 looks like

```json
 "11": {
      "0x3aa56d1524910435ee644c5f8804d1dd645e5a5c": {
          "400747",
          "9"
      },
      "0xaf1b056d8c2bd18263e0f65339bd3d6cf208d9d7": {
          "400741",
          "3" (you)
      },
      "0xcac62a2e4e42cced1f4e925108adc7cf22c1eee3": {
          "400757",
          "69"
      }
    }
```

assume we are 0xaf1b056d8c2bd18263e0f65339bd3d6cf208d9d7 claiming for epoch 11 

The pool total is 81
So we hold 3.7% of the pool
If the rewards are 100z or 100000000000000qa
then we are owed 3.7z

```https://devex.zilliqa.com/tx/4befd154976b30e0e727ef128f316294343f18a8df485a8913f7f9ed9654603e?network=https://zilliqa-isolated-server.zilliqa.com/```