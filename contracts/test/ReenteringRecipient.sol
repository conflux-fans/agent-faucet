// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentFaucet} from "../src/AgentFaucet.sol";

contract ReenteringRecipient {
    AgentFaucet public faucet;
    address public token;
    uint64 public entropyBlockNumber;
    uint256 public nonce;
    bool public attempted;

    function configure(AgentFaucet faucet_, address token_, uint64 entropyBlockNumber_, uint256 nonce_) external {
        faucet = faucet_;
        token = token_;
        entropyBlockNumber = entropyBlockNumber_;
        nonce = nonce_;
        attempted = false;
    }

    receive() external payable {
        if (attempted) {
            return;
        }
        attempted = true;
        try faucet.claim(address(this), token, entropyBlockNumber, nonce) {} catch {}
    }
}
