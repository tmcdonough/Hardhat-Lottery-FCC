// Raffle

// Functionality:
// 1) Enter the lottery (paying some amount)
// 2) Pick a verifiably random winner
// 3) Winner selected every X minutes -> completely automated / no maintenance

// Requirements:
// 1) Chainlink for randomness (vrf) & automated execution (keepers)

// HARDHAT AUTOCOMPLETE: yarn global add hardhat-shorthand
// -- now you can run "hh compile" instead of "yarn hardhat compile"

//SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

// when you add something like this to imports, need to do: "yarn add --dev @chainlink/contracts"
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";

// keepers
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

// Declare error codes up here.
error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

/** @title A sample raffle contract
 * @author TM
 * @notice this contract is for creating an untamperable decentralized smart contract
 * @dev implements vrfv2 and keepers
 */

// need to inherit vrfconsumerbase in our contract so that we can override fulfillrandomwords function
contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /* Types */
    enum RaffleState {
        OPEN,
        CALCULATING
    } // this is a uint256 where 0 = OPEN, 1 = CALCULATING.

    /* State Variables */

    // in past we've done things in terms of USD. We're just gonna do in terms of eth
    // recall that for variables we'll need to STORE on the lbockchain, we prepend with s_ and set to private to save gas.
    // also, since the entranceFee isnt ever going to be changed, can make it immutable
    // if we are doing immutable, instead of s_entranceFee we change to i_entranceFee
    // below we create a getter function so others can see the entrance Fee
    uint256 private immutable i_entranceFee;
    address payable[] private s_players; // this will have to be in storage since it'll be modified a lot.
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;

    // caps lock & underscores for constants
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint16 private constant NUM_WORDS = 1; // how many random numbers you want from VRF

    // Lottery Variables
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    // also have to add payable so we can pay them if they win. don't forget to add getter function.

    /* Events */
    // NAME events with function name reversed.
    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner);

    constructor(
        address vrfCoordinatorV2,
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        // s_raffleState = RaffleState(0);
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughETHEntered();
        }
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__NotOpen();
        }

        // assuming it does not revert, we need to keep track of this entrant.
        // note that msg.sender is not a payable address, so it needs to be typecast as such.
        s_players.push(payable(msg.sender));

        // --Events--
        // Events are inside logs. they are often used synonymously
        // events all you to print information to a log in a gas efficient way.
        // ***events/logs are not accessible to smart contracts***
        // events are tied to a smart contract though.
        // say you want to run one function after another function that changes block chain state is completed...
        // ...rather than continuously checking state of blockchain u can listen for event that gets emitted when that function completes.
        // --Using events--
        // 1. declare the event at top of contract: "event EVENTNAME(indexed topic1, indexed topic2, indexed topic3, param4, param5, ...)"
        // 2. call emit EVENTNAME(_topic1, _topic2, _topic3, _param4, _param5, ...) within a function
        // -- topics vs other variables --
        // 1. can do up to 3 topics per event. topics are indexable i.e. searchable
        // 2. the rest of the variables are stored in data, which you need contract abi to decode.
        emit RaffleEnter(msg.sender);
    }

    // chainlink keepers require checkUpkeep and performUpkeep. These are override functions so we have to import.
    // bytes calldata is a very *flexible* input parameter.
    // we arent using it tho, so going to comment it out.
    /**
     * @dev This is the function that the chainlink keeper nodes call
     * they look for upkeepNeeded to return true.
     * the following should be true in order to return true:
     * 1. Our time interval should have passed.
     * 2. The lottery should have at least 1 player and have some eth.
     * 3. Our subscription is funded wiht LINK
     * 4. The lottery should be in an "open" state.
     */

    function checkUpkeep(
        // block.timestamp - last block timestamp > some interval (number in seconds of how long we want to wait between lottery runs)
        // we need a state variable to keep track of previous block timestamp.
        bytes memory /*checkData*/ // we are keeping it public even tho could be view at this point.
    )
        public
        override
        returns (
            bool upkeepNeeded,
            // perform data is for additional functionality that we wont use right now.
            bytes memory /* performData */
        )
    {
        bool isOpen = (RaffleState.OPEN == s_raffleState);
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayers = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;

        // don't need to initialize upkeepNeeded here because we do so in the returns.
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
    }

    // remember, external functions are a little cheaper than public functions because solidity knows the contract cant call these functions itself
    // once checkUpkeep returns as true, the keepers will automatically call performUpkeep.
    function performUpkeep(
        bytes calldata /*performData*/
    ) external override {
        // right now anyone can call performUpkeep...
        // 1) make sure checkUpkeep is public so we can call it here
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle__UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        // request the random number
        // once we get the random number, do something with it
        // chainlink VRF is a 2 transaction process
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, // also called "keyHash". maximum price you're willing to pay in wei. Sets a ceiling in case gas prices spike.
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        ); // this returns a uniqueId that defines all of this info and who is requesting. We will emit an event with this info.
        emit RequestedRaffleWinner(requestId);
    }

    // 1) we are overriding the VRF function here which is why the name is not so intuitive. This is the "receive random winners" function (VRF is request/receive)
    // 2) it says Words for some math-based reason but it is basically "getNumbers"
    function fulfillRandomWords(
        uint256, /*requestId*/ // this tells our function we know you need a variable here of type uint256 but we dont use it so we pass a blank one.
        uint256[] memory randomWords
    ) internal override {
        // random word is a uint256 so it could be very massive and long. we use a modulo to convert it.
        // say our s_players size is 10 and rnadom number is 202.
        // if we do 202 % 10 == 2. so that's our random number.
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;

        // RESET RAFFLE STATE, PLAYERS AND TIMESTAMP:
        s_raffleState = RaffleState.OPEN;
        s_players = new address payable[](0);
        s_lastTimeStamp = block.timestamp;

        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        // require(success)
        if (!success) {
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    /* view/pure funcitons */
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    // because this is in the bytecode - a constant -it isnt reading from storage so it can be a PURE instead of a VIEW
    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
