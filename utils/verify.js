const { run } = require("hardhat")

// UTILS FOLDER
// This is so if we're using the same function in several deploys, we can just call this.

// JS VERSION:
async function verify(contractAddress, args) {
    // TS VERSION:
    // const verify = async (contractAddress: string, args: any[]) => {
    console.log("Verifying contract...")
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: args,
        }) // verify is the task and then :verify is the parameter/subtask. if you do yarn hardhat verify --help you can see other params (or on their github)
        // JS VERSION:
    } catch (e) {
        // TS VERSION:
        // } catch (e: any) {
        if (e.message.toLowerCase().includes("already verified")) {
            console.log("Already Verified")
        } else {
            console.log(e)
        }
    }
}

module.exports = { verify }
