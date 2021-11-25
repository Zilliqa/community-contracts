# Community Contracts

## Single Sided Asset Staking

Single Sided Asset Staking represents the logic of locking a fungible token over time and if eligible, assigned some rewards depending on their owned percentage of the stake pool.

### Fungible Tokens

A ZRC-2 fungible token.

We will be calling Transfer/TransferFrom and the respective allowance mechanism to move the fungible tokens into and from the contract, simiarly the admin will transfer rewards to the contract for users to consume.

### SingleSidedAssetStaking.scilla

A contract that takes an inital deposit of a tokens, then over time, depositing users that meet some time eligiblity are rewarded a percentage of a total amount of rewards from another contract.

The contract allows users to call deposit and be entered into a map called `pool`, a block is set in the future which an epoch occurs. Whenever a transaction is processed by the contract and the current block is in the future of the epoch, a reward calcluation `get_updated_reward_map_if_eligible` is performed which iterates `pool` entries and determines if the user is eligible for rewards, and if so, what the percentage that the user owns of the overall pool at the time of the epoch. This 500 map entries the worst case gas cost is approxomately 25 ZIL.

```ocaml
type UserSSAS  =  | UserSSAS of BNum    (* block entered staking *)
                                Uint128 (* deposited tokens *)
```

When users data is stored onchain, we store the block they entered (or re-entered) the staking contract, and when they claim for a particular epoch, we calculate the tax free lock as the deposit block time (as shown above) plus `minimum_lock_time_no_tax`

When users have deposited for longer than `epoch_period_length` blocks, on the next epoch they will be eligible for rewards when the calculation runs.

### Contract Arguments

```ocaml
contract SingleSidedAssetStaking
(
  init_contract_owner: ByStr20, (* owner of the contract and rewarder, can be changed *)
  stake_token_contract: ByStr20 with contract end, (* a token contract to be locked up *)
  reward_token_contract: ByStr20 with contract end, (* a reward contract to be rewarded to users *)
  reward_per_epoch: Uint128,  (* rewarded tokens per total per epoch *)
  epoch_calculation_period_length_in_blocks: Uint128, (* change min_stake_duration for testing *)
  init_minimum_lock_time_no_tax_in_blocks: Uint128, (* blocks that must pass since staking to calculate if taxable *)
  init_early_leave_tax_in_bps: Uint128    (* 0.1% = 1bps / 10% = 1000bps / 100% = 10000bps *)
)
```

### User Transitions

```ocaml
transition Deposit(deposit_amount: Uint128)
transition ClaimRewards()
transition Withdraw(withdraw_amount: Uint128)
```

### Admin Transitions

```ocaml
transition OwnerTopUpRewards(topup_amount: Uint128)
transition OwnerChangeTaxLockTime(new_min_tax_time_in_blocks: Uint128)
transition OwnerChangeTaxRate(new_tax_rate_in_bps: Uint128)
transition OwnerClaimTax()
transition OwnerReclaimRewards()
transition OwnerTogglePause(pause_state: Bool)
transition RequestOwnershipTransfer(new_owner : ByStr20)
transition ConfirmOwnershipTransfer()
```

## Testing

### Contract Setup

- DEPLOY FungibleToken.scilla as Stake_FT
- DEPLOY FungibleToken.scilla as Reward_FT
- DEPLOY SingleSidedAssetStaking.scilla as SSAS(owner, Stake_FT, Reward_FT, reward_per_epoch_in_tokens, epoch_length_in_blocks, min_time_no_tax_in_blocks, early_leave_tax_in_bps )
  Once the contract is deployed, any transition call will trigger an epoch when `NOW >= time_to_take_snapshot`

### Owner Setup

When sending rewards to the contract, it must be a full mutiple of reward_per_epoch_in_tokens

- CALL Reward_FT.IncreaseAllowance(SSAS,mutiple_reward_amount)
- CALL SSAS.OwnerTopUpRewards(mutiple_reward_amount)
  The contract now has funds, owner can also reclaim unclaimed funds using `OwnerReclaimRewards`

### User Depositing - InitalDepositSuccess

- CALL Stake_FT.IncreaseAllowance(SSAS,500)
- CALL SSAS.Deposit(1)
  Now we have an entry in `pool` with a block in the future where we become eligible for rewards
  Our Deposit is 1 and we can deposit 499 without recalling IncreaseAllowance.
  Inital Deposit Success Event

### User Depositing - IncreasingDepositSuccess - No Reward

- ...time...
- CALL SSAS.Deposit(1)
- Additional Deposit Success Event
- TRIGGERS RewardIfEpoch

We are increasing our claim by 1 - we ensure we continue to track additional increasing deposits.
Assuming we was eligible, since we have deposited, we have a new calculated block for becoming eligible, so instantly become ineligible for readding some stake amount.
Our Deposit is 2 and we can deposit 498 without recalling IncreaseAllowance.

### RewardIfEpoch => reward_map - First Insert

- ...time...
- USER B CALL Stake_FT.IncreaseAllowance(SSAS,100)
- USER B CALL SSAS.Deposit(100)
- TRIGGERS RewardIfEpoch
  Assuming User A was eligible, since user B called and triggered the epoch calculation `get_updated_reward_map_if_eligible` determines one entry, User A, is eligible after for-eaching all of the pool rows (currently 1). The calculation determines users percentage at an epoch which requires the total sum at user share hence for this expensive gas calculation as either the whole map is needing to be stored OR dynamically calculated at epoch and accumulativly added to the `reward` map

User B's data is inserted into the map after RewardIfEpoch is finished.
User A has been rewarded 100%.
User B's deposit is 100 and needs to call increase allowance to deposit further.

### RewardIfEpoch => reward_map - Additional Inserts

As above, but summed reward value for A and inital reward for B .

- ...time...
- USER C CALL Stake_FT.IncreaseAllowance(SSAS,100)
- USER C CALL SSAS.Deposit(100)
- TRIGGERS RewardIfEpoch
- Assuming User A and B are eligible, since user c called and triggered the epoch calculation `get_updated_reward_map_if_eligible` determines two entry, User A and B are eligible after for-eaching all of the pool rows (currently 2). The calculation determines users percentage at an epoch which requires the total sum at user share hence for this expensive gas calculation as either the whole map is needing to be stored OR dynamically calculated at epoch and accumulativly added to the `reward` map.

In this test case we can keep track of an increasing reward from A, and correctly calculating the % split between each users deposit amount.

User C's data is inserted into the map after RewardIfEpoch is finished.
User A has been rewarded 80.04% of the rewards for this epoch. User A should have a reward of old(100%) + new(80.04%).
User B has been rewarded 19.96% of the rewards for this epoch.
User C's deposit is 100 and needs to call increase allowance to deposit further.

### ClaimRewards - ClaimRewardsSuccess

User can claim some rewards if present

- Assuming the contract owner has deposted reward tokens.
- USER A HAS AN ENTRY IN `reward`
- USER A CALL SSAS.ClaimRewards()
- USER A IS RETURNED reward.pair.uint128_amount in reward fungible tokens
- USER A IS REMOVED FROM `reward`

User cannot continue to reclaim tokens from the contract once withdrawn.

### User Withdrawing Inital - TaxableWithdrawSuccess

Users are impacted with a X% tax if they withdraw inside the epoch window from their latest deposit or redeposit.

- ASSUMING TAX IS 1000 BPS (10%)
- USER A CALL SSAS.Deposit(10)
- USER A CALL SSAS.Withdraw(10)
- If now < stake_tax_applied then apply X(10%) tax
- USER A RETURNED 9 AND CONTRACT HOLDS 1

Users cannot be left with a balance of stake tokens below or equal to 9.

### User Withdrawing Inital - NonTaxableWithdrawSuccess

users can withdraw funds with 0% tax if they are outside of the epoch duration from their latest deposit. Redeposits will cause a new epoch tax duration for the entire stake.

- USER A CALL SSAS.Deposit(10)
- ...time...
- If stake_tax_applied < now then don't apply tax (future)
- USER A CALL SSAS.Withdraw(10)
- USER A RETURNED 10

### Owner Claim Inital Tax - OwnerClaimedTaxSuccess

Owner can claim some taxed amount

- ASSUMING CONTRACT HAS SOME `total_taxed_amount`
- OWNER CALL SSAS.OwnerClaimTax()
- OWNER RETURNED `total_taxed_amount`

### Owner Claim Rewards backup - OwnerClaimedTaxSuccess

Owner can reclaim any unclaimed reward tokens when the contract is paused.

- ASSUMING CONTRACT HAS SOME `total_rewards_left`
- OWNER CALL SSAS.OwnerTogglePause(false)
- OWNER CALL SSAS.OwnerReclaimRewards()
- OWNER RETURNED `total_rewards_left`
- USERS CAN NOT DEPOSIT FUNDS SINCE PAUSED
- USERS CAN NOT CLAIM REWARDS SINCE PAUSED
- USERS CAN WITHDRAW

### OwnerChangeTaxRate - OwnerChangeTaxRateSuccess

Owner can change the current tax rate.

- OWNER CALL SSAS.OwnerChangeTaxRate(x) where x is between 0 and 10000 represented as a % in bps.
- EMIT OwnerChangeTaxLockTimeSuccess

### OwnerChangeLockTime - OwnerChangeLockTime

Owner can change the minimum time that users are impacted by tax, can be zero

- OWNER CALL SSAS.OwnerChangeTaxRate(x) where x is above or equal to 0, representes blocks elapsed after user stake to tax if withdrawing early.
- EMIT OwnerChangeTaxLockTimeSuccess

# Improvements / Enhancements

If no-one is present in the stake map, then when epoch reward triggers, skip block counters forward to the last valid epoch, so that contract doesn't expire before rewards are potentially finished.

Add a secondary pause (emergency stop vs safe stop) for when contract is out of funds so it doesn't accept more deposits of user stake funds or owner reward funds (contract is dead at this point, user has let the timer expire and now calculating rewards for the future is potentially dangerous after stopping. If contract expired, the pattern is to redeploy and reconfigure)
