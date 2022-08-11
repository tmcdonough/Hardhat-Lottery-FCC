const { getNamedAccounts, deployments, network, ethers, run } = require("hardhat")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("2")

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordinatorV2Address, subscriptionId

    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock") // since mocks deploy script is 00-, they will have dpeloyed first if this is the right chain.
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address

        // the new thing about VRFV2 is the subscriptions. One account pays for any number of consumer contracts.
        // this is how we create a subscription / access it / fund it via mocks.
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait(1) // this receipt includes an emitted event which includes our subscription id.
        subscriptionId = transactionReceipt.events[0].args.subId.toString() // check docs or contract for this one.
        // fund the subscription
        // on a real network you need LINK but the mock doesnt require this
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
    } else {
        // if not a development chain, need dto import the address from the chain.
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        // for some reason he isnt creating a subscriptionId programmatically for the test nets. we have to manually create using the chainlink ui...
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }

    const entranceFee = networkConfig[chainId]["entranceFee"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]

    console.log(`---1---${entranceFee}`)
    console.log(`---2---${gasLane}`)
    console.log(`---3---${callbackGasLimit}`)
    console.log(`---4---${interval}`)
    console.log(`---5---${subscriptionId}`)

    const args = [
        vrfCoordinatorV2Address,
        entranceFee,
        gasLane,
        subscriptionId,
        callbackGasLimit,
        interval,
    ]
    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(raffle.address, args)
    }
    log("----------------------------------")
}

module.exports.tags = ["all", "raffle"]
