const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

// remember, describe blocks can't work with promises so no need to use async keyword.

!developmentChains.includes(network.name) // if not a development chain environment...
    ? describe.skip // ... then skip
    : describe("Raffle", function () {
          // ...else do all of this:
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee
          let deployer // this needed to be added so it was global
          let interval // this also needed to be added
          const chainId = network.config.chainId

          beforeEach(async function () {
              //   const { deployer } = await getNamedAccounts() // THIS IS NOT ENOUGH. NEEDS TO BE DECLARED GLOBALLY ABOVE FIRST.
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"]) // run all deploy scripts with "all" tag.
              raffle = await ethers.getContract("Raffle", deployer) // since we just deployed all contracts, we get the most recent raffle contract and attach our deployer address to it
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer) // get hte most recent coord mock and attach our deployer addr
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("constructor", function () {
              it("initializes the raffle correctly", async function () {
                  // ideally just one assert per "it" function, we will break this.
                  const raffleState = await raffle.getRaffleState()
                  const interval = await raffle.getInterval()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enter raffle", function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughETHEntered"
                  )
              })
              it("records players when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })
              it("emits event on enter", async function () {
                  // .to.emit is from ethereum-waffle
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })
              it("doesn't allow entrance when raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee }) // raffle will still be in open state after this.
                  // now we need to get the raffle into "calculating" state. so, we have to mimic the functionality of the keepers
                  // perform upkeep will change to calculating state, but performupkeep will only run if checkupkeep is true
                  // so we need to get checkupkeep to be true to test this out
                  // for checkupkeep to be true, needs: OPEN && time to have passed 30 seconds && players >0 && has a balance
                  // for the time to passed, hh has a way to manipulate the blockchain to move timeforward.
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", []) // need to just mine one extra block after time forward.
                  // now we pretend to be a keeper (TM: "ANYONE CAN CALL PERFORM UPKEEP?")
                  // since checkupkeep should return TRUE based on the increaseTime call above, performUpkeep should change the
                  // state enum to be "CALCULATING"

                  await raffle.performUpkeep([])
                  // in calculating, noone should be able to enter the lottery
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      "Raffle__NotOpen"
                  )
              })
          })
          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  // can simulate calling functions just to see how it responds, without the full transaction (gas savings? no state change?)
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded) // should return false since theres been no eth sent to the contract.
              })
              it("returns false if raffle isn't open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep("0x") // hh knows that "0x" is a blank bytes object
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })

              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
          })
          describe("performUpkeep", function () {
              it("it can only run if checkupkeep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = await raffle.performUpkeep("0x") // can do [] or "0x"
                  assert(tx)
              })
              it("reverts when checkupkeep is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle__UpkeepNotNeeded" // could be even more specific with string interpolation of the other items the error comes with (address, number of players, balance etc.)
                  )
              })
              it("updates the raffle state, emits an event, and calls the vrf coordinator", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const txResponse = await raffle.performUpkeep("0x")
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.events[1].args.requestId // 1st event not 0th, because 0th event will be coming from the function call itself.
                  const raffleState = await raffle.getRaffleState()
                  assert(requestId.toNumber() > 0)
                  assert(raffleState.toString() == "1")
              })
          })
          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  // before checking, we will have someone enter hte lottery, increase time and mine a block. so keepers will decide upkeep is needed
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })
              it("can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
              })
              // this basically tests that a random winner winners and that they get the money
              // remember that in beforeeach we have the deployer enter the raffle and we speed up the time such that a keeper event is needed.
              // so we're starting from a place of one entrant and ready to select a winner.
              // we add a few more accounts
              // then we create a promise that will only resolve once a winner has been picked, and we include our tests in there
              // so even though this is written before we actually call performUpkeep, this is the point of async... it just waits for us to run upkeep

              it("picks a winner, resets the lottery, and sends money", async function () {
                  // need to add additional entrants
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 // deployer is 0
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp()

                  // perform upkeep (mock being chainlink keepers)
                  // fulfillRandomWords (mock being the chainlink vrf)
                  // on a testnet we would need to wait for fulfillrandomwords to be called. so we will simulate on the local network
                  // so we create a promise
                  await new Promise(async (resolve, reject) => {
                      // set up a listener for winner picked.
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the event!")
                          // need to put all of the code within the promise because otherwise it will never be resolved. will always be waiting for ".once" to get resolved.
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              console.log(recentWinner)
                              console.log(accounts[3].address)
                              console.log(accounts[2].address)
                              console.log(accounts[1].address)
                              console.log(accounts[0].address)
                              const winnerEndingBalance = await accounts[1].getBalance()
                              const raffleState = await raffle.getRaffleState()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              const numPlayers = await raffle.getNumberOfPlayers()
                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp) // timestamp shouldve been updated. we defined the startingtimestamp above.

                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      raffleEntranceFee
                                          .mul(additionalEntrants)
                                          .add(raffleEntranceFee)
                                          .toString()
                                  )
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      // once the winner picked
                      // mock the chainlink keeper
                      const tx = await raffle.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      const winnerStartingBalance = await accounts[1].getBalance()

                      // mock the vrf
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
