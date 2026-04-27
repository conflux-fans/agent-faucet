// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    bool public failTransfers;

    constructor() ERC20("Mock Token", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFailTransfers(bool fail) external {
        failTransfers = fail;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (failTransfers && from != address(0)) {
            revert("TRANSFER_FAILED");
        }
        super._update(from, to, value);
    }
}
