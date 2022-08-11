const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

// BEFORE testing on a testnet, we need to get chainlink VRF subscription (because he isnt signing up programmatically for some reason)
// 1. Get subid from chainlink VRF (https://vrf.chain.link/new)
// 2. deploy contract using the subid
// 3. register the contract with vrf & its subid
// 4. register the contract with keepers
// 5. run test

developmentChains.includes(network.name) // if a development chain environment...
    ? describe.skip // ... then skip
    : describe("Raffle", function () {
          // ...else do all of this:
          let raffle, raffleEntranceFee, deployer

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer) // since we just deployed all contracts, we get the most recent raffle contract and attach our deployer address to it
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("works with live chainlink keepers and chainlink vrf, we get a random winner", async function () {
                  // all we need to do is enter the raffle. Chainlink keepers and VRF should do the rest of it for us...
                  const startingTimeStamp = await raffle.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()

                  // setup listener before we enter the raffle just in case hte blockchain moves quickly (i.e., if we enter the raffle before we have a listener setup and blockchain selects a winner before our listener code executes, we'll miss it.)
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              // some people in forums also havin an issue with winnerStartingBalance not being initialized and added this setTImeout
                              setTimeout(async () => {
                                  // add our asserts here
                                  const recentWinner = await raffle.getRecentWinner()
                                  const raffleState = await raffle.getRaffleState()
                                  const winnerEndingBalance = await accounts[0].getBalance()
                                  const endingTimeStamp = await raffle.getLatestTimeStamp()

                                  await expect(raffle.getPlayer(0)).to.be.reverted // shouldnt be any players after lottery resets
                                  assert.equal(recentWinner.toString(), accounts[0].address) // deployer is recent winner
                                  assert.equal(raffleState, 0) // enum should go back to OPEN
                                  assert.equal(
                                      winnerEndingBalance.toString(),
                                      winnerStartingBalance.add(raffleEntranceFee).toString()
                                  ) // since we check balance *after* they enter (i.e., net of gas fees), we can just add the entrance fee back
                                  assert(endingTimeStamp > startingTimeStamp)
                                  resolve()
                              }, 15000)
                          } catch (error) {
                              console.log(error)
                              reject(e)
                          }
                      })
                      // then entering the raffle
                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await tx.wait(1)

                      const winnerStartingBalance = await accounts[0].getBalance()

                      // and this code wont complete until our listener has finished listening (i.e., timeout, rejected, or resolved)
                  })
              })
          })
      })
