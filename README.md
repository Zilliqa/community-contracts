# Community Contracts

## Single Sided Asset Staking

Single Sided Asset Staking is locking up a fungible token and being returned an equal amount of "" tokens, representing the deposted or "staked" amount.

### Fungible Tokens

A ZRC-2 fungible token.

We will be calling Transfer/TransferFrom and the respective allowance mechanism to move the fungible tokens into and from the contract, simiarly the admin will transfer rewards to the contract for users to consume.

### SingleSidedAssetStaking.scilla

A contract that takes an inital deposit of a tokens, then over time, depositing users that meet some time eligiblity are rewarded a percentage of a total amount of rewards of either the same token contract, or an entirely new token.

The contract allows users to call deposit and be entered into a map called ```pool```, a block is set in the future which an epoch occurs. Whenever a transaction is processed by the contract and the current block is in the future of the epoch, a reward calcluation ```get_updated_reward_map_if_eligible``` is performed which iterates ```pool``` entries and determines if the user is eligible for rewards, and if so, what the percentage that the user owns of the overall pool at the time of the epoch. This 500 map entries the worst case gas cost is approxomately 25 ZIL.

```ocaml
type UserSSAS  =  | UserSSAS of BNum    (* block entered staking *)
                                Uint128 (* deposited tokens *)
```

When users data is stored onchain, we store the block they entered (or re-entered) the staking contract, and when they claim for a particular epoch, we calculate the tax free lock as the deposit block time (as shown above) plus ```minimum_lock_time_no_tax```

When users have deposited for longer than ```epoch_period_length``` blocks, on the next epoch they will be eligible for rewards when the calculation runs.

## Testing

### Contract Setup

* DEPLOY FungibleToken.scilla as Stake_FT
* DEPLOY FungibleToken.scilla as Reward_FT
* DEPLOY SingleSidedAssetStaking.scilla as SSAS(Stake_FT, Reward_FT, TAX, EPOCH, REWARD_AMOUNT_PER_EPOCH)
Once the contract is deployed, any transition call will trigger an epoch when ```NOW >= time_to_take_snapshot```

### Owner Setup

* CALL Reward_FT.IncreaseAllowance(SSAS,200000000000000)
* CALL SSAS.OwnerTopUpRewards(200000000000000)
The contract now has funds, owner can also reclaim unclaimed funds using ```OwnerReclaimRewards```

### User Depositing -  InitalDepositSuccess

* CALL Stake_FT.IncreaseAllowance(SSAS,500)
* CALL SSAS.Deposit(1)
Now we have an entry in ```pool``` with a block in the future where we become eligible for rewards
Our Deposit is 1 and we can deposit 499 without recalling IncreaseAllowance.

### User Depositing - IncreasingDepositSuccess - No Reward

* ...time...
* CALL SSAS.Deposit(1)
* TRIGGERS RewardIfEpoch

We are increasing our claim by X - we ensure we continue to track additional increasing deposits.
Assuming we was eligible, since we have deposited, we have a new calculated block for becoming eligible, so instantly become ineligible for readding some stake amount.
Our Deposit is 2 and we can deposit 498 without recalling IncreaseAllowance.

### RewardIfEpoch => reward_map - First Insert

* ...time...
* USER B CALL Stake_FT.IncreaseAllowance(SSAS,100)
* USER B CALL SSAS.Deposit(100)
* TRIGGERS RewardIfEpoch 
Assuming User A was eligible, since user B called and triggered the epoch calculation ```get_updated_reward_map_if_eligible``` determines one entry, User A, is eligible after for-eaching all of the pool rows (currently 1). The calculation determines users percentage at an epoch which requires the total sum at user share hence for this expensive gas calculation as either the whole map is needing to be stored OR dynamically calculated at epoch and accumulativly added to the ```reward``` map

User B's data is inserted into the map after  RewardIfEpoch is finished.
User B's deposit is 100 and needs to call increase allowance to deposit further.

### RewardIfEpoch => reward_map - Additional Inserts

As above, but summed reward value.

* ...time...
* USER B CALL Stake_FT.IncreaseAllowance(SSAS,100)
* USER B CALL SSAS.Deposit(100)
* TRIGGERS RewardIfEpoch

In this test case we can keep track of an increasing deposit.

User B's data is inserted into the map after  RewardIfEpoch is finished.
User B's deposit is 200 and needs to call increase allowance to deposit further.

### RewardIfEpoch - SnapshotSuccess - Inital Insert

First snapshot is saved saved correctly for percentage amount.

* USER A IS VALID FOR REWARDS
* USER B IS NOT VALID FOR REWARDS
* Some transaction TRIGGERS RewardIfEpoch
* User A's percentage of the pool (that are eligible) is rewarded and accumulated in ```reward```
* User B's row is ignored

### RewardIfEpoch - SnapshotSuccess - Addtional Inserts

Additional snapshots are saved correctly for percentage amount.

* USER A IS VALID FOR REWARDS
* USER B IS VALID FOR REWARDS
* Some transaction TRIGGERS RewardIfEpoch
* User A's percentage of the pool (that are eligible) is rewarded and accumulated in ```reward```
* User A's percentage of the pool (that are eligible) is rewarded and accumulated in ```reward```

### ClaimRewards - ClaimRewardsSuccess

User can claim some rewards if present

* Assuming the contract owner has deposted reward tokens.
* USER A HAS AN ENTRY IN ```reward```
* USER A CALL SSAS.ClaimRewards()
* USER A IS RETURNED reward.pair.uint128_amount in reward fungible tokens
* USER A IS REMOVED FROM ```reward```
  

### User Withdrawing Inital - TaxableWithdrawSuccess

Users are impacted with a 10% tax if they withdraw inside the epoch window from their latest deposit or redeposit.

* ASSUMING TAX IS 1000 BPS (10%)
* USER A CALL SSAS.Deposit(10)
* USER A CALL SSAS.Withdraw(10) immediately after deposit.
* USER A RETURNED 9 AND CONTRACT HOLDS 1

Divide bug instead of percent?

* USER A CALL SSAS.Deposit(1)
* USER A CALL SSAS.Withdraw(1)
* NO TAX IS APPLIED
  
### User Withdrawing Inital - NonTaxableWithdrawSuccess

users can withdraw funds with 0% tax if they are outside of the epoch duration from their latest deposit. Redeposits will cause a new epoch tax duration for the entire stake.

* USER A CALL SSAS.Deposit(10)
* ...time...
* USER A CALL SSAS.Withdraw(10)
* USER A RETURNED 10

### Owner Claim Inital Tax - OwnerClaimedTaxSuccess

Owner can claim some taxed amount

* ASSUMING CONTRACT HAS SOME ```total_taxed_amount```
* OWNER CALL SSAS.OwnerClaimTax()
* OWNER RETURNED ```total_taxed_amount```

### Owner Claim Rewards backup - OwnerClaimedTaxSuccess

Owner can reclaim any unclaimed rewards when the contract is paused.

* ASSUMING CONTRACT HAS SOME ```total_rewards_left```
* OWNER CALL SSAS.OwnerTogglePause(false)
* OWNER CALL SSAS.OwnerReclaimRewards()
* OWNER RETURNED ```total_rewards_left```
* USERS CAN NOT DEPOSIT FUNDS SINCE PAUSED
* USERS CAN NOT CLAIM REWARDS SINCE PAUSED
* USERS CAN WITHDRAW

### OwnerChangeEpochLength - OwnerChangeEpochLengthSuccess

Owner can change the time an epoch calculation occurs.

### OwnerChangeTaxRate - OwnerChangeTaxRateSuccess

Owner can change the current tax rate.

### OwnerChangeLockTime - OwnerChangeLockTime

Owner can change the current tax timer value.

# Improvements / Enhancements

* Inital Epoch is _deployed_block but should be _deployed_block + epoch_length
  * function? 

* withdrawing a deposit stake less than Uint128 10 cannot be taxed when eligible
  * Add minimum stake? 

* Make epoch length and eligiblity time distinct fields
  * so that you can be eligible between an epoch you joined and the next epoch is rewarded 