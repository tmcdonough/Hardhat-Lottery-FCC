const { developmentChains } = require("../helper-hardhat-config")
const { network, ethers } = require("hardhat")

// premium in the docs is the baseFee
const BASE_FEE = ethers.utils.parseEther("0.25") // 0.25 is the premium. 0.25 LINK per request.

const GAS_PRICE_LINK = 1e9 // calculated value based on the gas price of the chain. since the oracles pay the gas, this fluctuates to equal what the oracles pay.

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const args = [BASE_FEE, GAS_PRICE_LINK]

    if (developmentChains.includes(network.name)) {
        log("Local network detected! Deploying mocks...")
        // deploy a mockv3coordinator
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            mock: true,
            args: args,
        })
        log("Mocks Deployed")
        log("-----------------------------------------------------------------------------------")
    }
}

module.exports.tags = ["all", "mocks"]
