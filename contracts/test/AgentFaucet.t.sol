// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentFaucet} from "../src/AgentFaucet.sol";
import {MockERC20} from "./MockERC20.sol";
import {ReenteringRecipient} from "./ReenteringRecipient.sol";
import {RejectingRecipient} from "./RejectingRecipient.sol";

contract AgentFaucetTest is Test {
    AgentFaucet internal faucet;
    MockERC20 internal token;

    address internal owner = address(this);
    address internal recipient = address(0xBEEF);
    uint256 internal constant AMOUNT = 0.01 ether;
    uint64 internal constant MIN_AGE = 8;
    uint64 internal constant MAX_AGE = 45;
    uint64 internal constant COOLDOWN = 86_400;
    uint64 internal constant NATIVE_GAS_LIMIT = 30_000;
    uint256 internal constant EASY_TARGET = type(uint256).max;

    function setUp() public {
        vm.roll(1_000);
        faucet = new AgentFaucet(_global(EASY_TARGET, AMOUNT, COOLDOWN, NATIVE_GAS_LIMIT), owner);
        token = new MockERC20();

        faucet.setTokenConfig(
            address(0), AgentFaucet.TokenConfig({enabled: true, cooldownBlocks: 0, amount: 0, target: 0})
        );
        faucet.setTokenConfig(
            address(token), AgentFaucet.TokenConfig({enabled: true, cooldownBlocks: 0, amount: 0, target: 0})
        );

        vm.deal(address(faucet), 10 ether);
        token.mint(address(faucet), 10 ether);
    }

    function testNativeHappyPath() public {
        uint64 entropyBlock = _setEntropyBlock();

        faucet.claim(recipient, address(0), entropyBlock, 0);

        assertEq(recipient.balance, AMOUNT);
        assertEq(faucet.nextClaimBlock(recipient, address(0)), uint64(block.number + COOLDOWN));
    }

    function testERC20HappyPath() public {
        uint64 entropyBlock = _setEntropyBlock();

        faucet.claim(recipient, address(token), entropyBlock, 1);

        assertEq(token.balanceOf(recipient), AMOUNT);
        assertEq(faucet.nextClaimBlock(recipient, address(token)), uint64(block.number + COOLDOWN));
    }

    function testSameProofReplayFails() public {
        uint64 entropyBlock = _setEntropyBlock();

        faucet.claim(recipient, address(0), entropyBlock, 0);

        vm.expectRevert(
            abi.encodeWithSelector(
                AgentFaucet.ClaimCooldownActive.selector, recipient, address(0), uint64(1_000 + COOLDOWN), block.number
            )
        );
        faucet.claim(recipient, address(0), entropyBlock, 0);
    }

    function testDifferentProofSameRecipientTokenBeforeCooldownFails() public {
        uint64 entropyBlock = _setEntropyBlock();
        faucet.claim(recipient, address(0), entropyBlock, 0);

        vm.roll(block.number + 10);
        uint64 nextEntropyBlock = _setEntropyBlock();

        vm.expectRevert(
            abi.encodeWithSelector(
                AgentFaucet.ClaimCooldownActive.selector, recipient, address(0), uint64(1_000 + COOLDOWN), block.number
            )
        );
        faucet.claim(recipient, address(0), nextEntropyBlock, 2);
    }

    function testClaimSucceedsAfterCooldown() public {
        uint64 entropyBlock = _setEntropyBlock();
        faucet.claim(recipient, address(0), entropyBlock, 0);

        vm.roll(block.number + COOLDOWN);
        uint64 nextEntropyBlock = _setEntropyBlock();
        faucet.claim(recipient, address(0), nextEntropyBlock, 3);

        assertEq(recipient.balance, AMOUNT * 2);
    }

    function testDifferentRecipientsClaimIndependently() public {
        uint64 entropyBlock = _setEntropyBlock();
        address other = address(0xCAFE);

        faucet.claim(recipient, address(0), entropyBlock, 0);
        faucet.claim(other, address(0), entropyBlock, 0);

        assertEq(recipient.balance, AMOUNT);
        assertEq(other.balance, AMOUNT);
    }

    function testEntropyTooRecentFails() public {
        uint64 entropyBlock = uint64(block.number - MIN_AGE + 1);
        vm.setBlockhash(entropyBlock, keccak256("too-recent"));

        vm.expectRevert(
            abi.encodeWithSelector(AgentFaucet.EntropyTooRecent.selector, entropyBlock, block.number, MIN_AGE)
        );
        faucet.claim(recipient, address(0), entropyBlock, 0);
    }

    function testEntropyTooOldFails() public {
        uint64 entropyBlock = uint64(block.number - MAX_AGE - 1);
        vm.setBlockhash(entropyBlock, keccak256("too-old"));

        vm.expectRevert(abi.encodeWithSelector(AgentFaucet.EntropyTooOld.selector, entropyBlock, block.number, MAX_AGE));
        faucet.claim(recipient, address(0), entropyBlock, 0);
    }

    function testCurrentOrFutureEntropyBlockFails() public {
        vm.expectRevert(
            abi.encodeWithSelector(AgentFaucet.EntropyBlockNotPast.selector, uint64(block.number), block.number)
        );
        faucet.claim(recipient, address(0), uint64(block.number), 0);

        vm.expectRevert(
            abi.encodeWithSelector(AgentFaucet.EntropyBlockNotPast.selector, uint64(block.number + 1), block.number)
        );
        faucet.claim(recipient, address(0), uint64(block.number + 1), 0);
    }

    function testInvalidProofTargetFails() public {
        faucet.setGlobalConfig(_global(1, AMOUNT, COOLDOWN, NATIVE_GAS_LIMIT));
        uint64 entropyBlock = _setEntropyBlock();

        bytes32 digest = faucet.computeDigest(
            recipient, address(0), entropyBlock, blockhash(entropyBlock), uint256(0)
        );
        vm.expectRevert(abi.encodeWithSelector(AgentFaucet.InvalidProof.selector, digest, uint256(1)));
        faucet.claim(recipient, address(0), entropyBlock, 0);
    }

    function testConfigInheritanceAndTokenOverride() public {
        faucet.setTokenConfig(
            address(token),
            AgentFaucet.TokenConfig({enabled: true, cooldownBlocks: 5, amount: 123, target: EASY_TARGET - 1})
        );

        AgentFaucet.EffectiveTokenConfig memory effective = faucet.getEffectiveTokenConfig(address(token));

        assertTrue(effective.enabled);
        assertEq(effective.cooldownBlocks, 5);
        assertEq(effective.amount, 123);
        assertEq(effective.target, EASY_TARGET - 1);
    }

    function testDisabledTokenFails() public {
        faucet.setTokenConfig(
            address(0), AgentFaucet.TokenConfig({enabled: false, cooldownBlocks: 0, amount: 0, target: 0})
        );
        uint64 entropyBlock = _setEntropyBlock();

        vm.expectRevert(abi.encodeWithSelector(AgentFaucet.TokenDisabled.selector, address(0)));
        faucet.claim(recipient, address(0), entropyBlock, 0);
    }

    function testPauseFailsClaim() public {
        faucet.pause();
        uint64 entropyBlock = _setEntropyBlock();

        vm.expectRevert();
        faucet.claim(recipient, address(0), entropyBlock, 0);
    }

    function testWithdrawNativeAndERC20() public {
        address payable to = payable(address(0xDAD));

        faucet.withdrawNative(to, 1 ether);
        faucet.withdrawERC20(address(token), to, 2 ether);

        assertEq(to.balance, 1 ether);
        assertEq(token.balanceOf(to), 2 ether);
    }

    function testNativeTransferFailureRevertsAndDoesNotConsumeCooldown() public {
        RejectingRecipient rejecting = new RejectingRecipient();
        uint64 entropyBlock = _setEntropyBlock();

        vm.expectRevert(
            abi.encodeWithSelector(AgentFaucet.NativeTransferFailed.selector, address(rejecting), AMOUNT)
        );
        faucet.claim(address(rejecting), address(0), entropyBlock, 0);

        assertEq(faucet.nextClaimBlock(address(rejecting), address(0)), 0);
    }

    function testERC20TransferFailureRevertsAndDoesNotConsumeCooldown() public {
        token.setFailTransfers(true);
        uint64 entropyBlock = _setEntropyBlock();

        vm.expectRevert();
        faucet.claim(recipient, address(token), entropyBlock, 0);

        assertEq(faucet.nextClaimBlock(recipient, address(token)), 0);
    }

    function testReentrantNativeRecipientCannotClaimAgainDuringTransfer() public {
        ReenteringRecipient reentering = new ReenteringRecipient();
        uint64 entropyBlock = _setEntropyBlock();
        reentering.configure(faucet, address(0), entropyBlock, 0);

        faucet.claim(address(reentering), address(0), entropyBlock, 0);

        assertTrue(reentering.attempted());
        assertEq(address(reentering).balance, AMOUNT);
        assertEq(faucet.nextClaimBlock(address(reentering), address(0)), uint64(block.number + COOLDOWN));
    }

    function testComputeDigestMatchesExpectedVector() public view {
        bytes32 entropyHash = keccak256("vector-entropy");
        bytes32 digest = faucet.computeDigest(recipient, address(0), 992, entropyHash, 7);
        bytes32 expected = keccak256(
            abi.encode(
                faucet.POW_VERSION_HASH(),
                block.chainid,
                address(faucet),
                recipient,
                address(0),
                uint64(992),
                entropyHash,
                uint256(7)
            )
        );

        assertEq(digest, expected);
    }

    function testInvalidGlobalConfigFails() public {
        vm.expectRevert(AgentFaucet.InvalidGlobalConfig.selector);
        faucet.setGlobalConfig(_global(0, AMOUNT, COOLDOWN, NATIVE_GAS_LIMIT));
    }

    function testEnabledNonContractERC20Fails() public {
        vm.expectRevert(abi.encodeWithSelector(AgentFaucet.InvalidTokenAddress.selector, address(0x1234)));
        faucet.setTokenConfig(
            address(0x1234), AgentFaucet.TokenConfig({enabled: true, cooldownBlocks: 0, amount: 0, target: 0})
        );
    }

    function _setEntropyBlock() internal returns (uint64 entropyBlock) {
        entropyBlock = uint64(block.number - MIN_AGE);
        vm.setBlockhash(entropyBlock, keccak256(abi.encodePacked("entropy", block.number)));
    }

    function _global(uint256 target, uint256 amount, uint64 cooldown, uint64 gasLimit)
        internal
        pure
        returns (AgentFaucet.GlobalConfig memory)
    {
        return AgentFaucet.GlobalConfig({
            minEntropyAgeBlocks: MIN_AGE,
            maxEntropyAgeBlocks: MAX_AGE,
            defaultCooldownBlocks: cooldown,
            nativeTransferGasLimit: gasLimit,
            defaultAmount: amount,
            defaultTarget: target
        });
    }
}
