# Community Contracts

## Single Sided Asset Staking

Single Sided Asset Staking is locking up a fungible token and being returned an equal amount of "" tokens, representing the deposted or "staked" amount.

### Fungible Tokens

A ZRC-2 fungible token.

We will be calling Transfer/TransferTo and the respective allowance mechanism to move the fungible tokens into  tokens.

### SingleSidedAssetStaking.scilla

A contract that takes a deposit of  tokens, a deposit of reward tokens by the admin, and an epoch length.

The contract allows users to call deposit and be entered into a map called ```ssas_pool```, every amount of ```epoch_period_length``` a copy of ```ssas_pool``` is read into a larger nested map called ```past_snapshot_pool```, this snapshot captures the amount of each users liquidity at a particular block.

```ocaml
type UserSSAS  =  | UserSSAS of ByStr20 (* user *)
                                BNum    (* block entered staking *)
                                Uint128 (* deposited tokens *)
```

When users data is stored onchain, we store the block they entered (or re-entered) the staking contract, and when they claim for a particular epoch, we check the deposit block time plus the epoch length and check that against the current time, meaning they cannot claim for past epochs.

When users have claimed for longer than an epoch amount of blocks, on the next snapshot, they will be eligible for rewards. When a user claims, they claim for a specific snapshotID which increments from zero.

When users successfully claim for an snapshot they are found in, and previously haven't claimed for, the row is found and their amount of staked tokens is returned. The total amount of staked tokens is also returned from the pool. From here we can calculate a percentage of the immutable ```immutable_reward_per_epoch``` and send this calculated amount to the ```reward_token_contract``` with the caller as the recipient of the reward tokens the contract holds from the admin depositing. 

BUG : reward claim amount is wrong

## Testing

### Setup

* DEPLOY FungibleToken.scilla as Stake_FT
* DEPLOY FungibleToken.scilla as Reward_FT
* DEPLOY SingleSidedAssetStaking.scilla as SSAS(Stake_FT, Reward_FT, TAX, EPOCH, REWARD_AMOUNT_PER_EPOCH)
Once the contract is deployed, any transition call will trigger an epoch when ```NOW >= time_to_take_snapshot```

### Admin

* CALL Reward_FT.IncreaseAllowance(SSAS,200000000000000)
* CALL SSAS.AdminDeposit(200000000000000)
The contract now has funds, admin can also reclaim unclaimed funds using ```OwnerReclaimRewards```

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

### ClaimRewards - ClaimRewardsSuccess
Given a user has some entry in rewards 
And the contract has some fungible rewards the admin has sent it
When calling ClaimRewards
Then the reward amount from the reward contract is sent from the SSAS contract to the reward _sender address

### RewardIfEpoch => reward_map - Additional Inserts
as above but summed reward value

### User Withdrawing Inital - TaxableWithdrawSuccess
Users are impacted with a 10% tax if they withdraw inside the epoch window from their latest deposit or redeposit.

### User Withdrawing Inital - NonTaxableWithdrawSuccess
users can withdraw funds with 0% tax if they are outside of the epoch duration from their latest deposit or redeposit.

### Admin Claim Inital Tax - AdminClaimedTaxSuccess
Admin can reclaim the tax earnt from users exiting early

### User Claim Rewards backup - AdminClaimedTaxSuccess
Admin can reclaim any unclaimed rewards at anytime