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