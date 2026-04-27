// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract AgentFaucet is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant POW_VERSION_HASH = keccak256("AGENT_FAUCET_POW_V1");
    address public constant NATIVE_TOKEN = address(0);

    struct GlobalConfig {
        uint64 minEntropyAgeBlocks;
        uint64 maxEntropyAgeBlocks;
        uint64 defaultCooldownBlocks;
        uint64 nativeTransferGasLimit;
        uint256 defaultAmount;
        uint256 defaultTarget;
    }

    struct TokenConfig {
        bool enabled;
        uint64 cooldownBlocks;
        uint256 amount;
        uint256 target;
    }

    struct EffectiveTokenConfig {
        bool enabled;
        uint256 amount;
        uint256 target;
        uint64 cooldownBlocks;
    }

    GlobalConfig private _globalConfig;

    mapping(address token => TokenConfig config) public tokenConfigs;
    mapping(address recipient => mapping(address token => uint64 blockNumber)) public nextClaimBlock;

    error InvalidGlobalConfig();
    error InvalidTokenAddress(address token);
    error TokenDisabled(address token);
    error ClaimCooldownActive(address recipient, address token, uint64 nextClaimBlock, uint256 currentBlock);
    error EntropyBlockNotPast(uint64 entropyBlockNumber, uint256 currentBlock);
    error EntropyTooRecent(uint64 entropyBlockNumber, uint256 currentBlock, uint64 minAge);
    error EntropyTooOld(uint64 entropyBlockNumber, uint256 currentBlock, uint64 maxAge);
    error EntropyUnavailable(uint64 entropyBlockNumber);
    error InvalidProof(bytes32 digest, uint256 target);
    error NativeTransferFailed(address recipient, uint256 amount);
    error BlockNumberOverflow(uint256 nextClaimBlock);
    error WithdrawFailed(address to, uint256 amount);

    event GlobalConfigUpdated(GlobalConfig config);
    event TokenConfigUpdated(address indexed token, TokenConfig config);
    event Claimed(
        address indexed recipient,
        address indexed token,
        uint256 amount,
        uint64 entropyBlockNumber,
        bytes32 digest
    );
    event NativeWithdrawn(address indexed to, uint256 amount);
    event ERC20Withdrawn(address indexed token, address indexed to, uint256 amount);

    constructor(GlobalConfig memory initialConfig, address initialOwner) Ownable(initialOwner) {
        _setGlobalConfig(initialConfig);
    }

    receive() external payable {}

    function getGlobalConfig() external view returns (GlobalConfig memory) {
        return _globalConfig;
    }

    function getEffectiveTokenConfig(address token) public view returns (EffectiveTokenConfig memory effective) {
        TokenConfig memory tokenConfig = tokenConfigs[token];

        effective.enabled = tokenConfig.enabled;
        effective.amount = tokenConfig.amount == 0 ? _globalConfig.defaultAmount : tokenConfig.amount;
        effective.target = tokenConfig.target == 0 ? _globalConfig.defaultTarget : tokenConfig.target;
        effective.cooldownBlocks = tokenConfig.cooldownBlocks == 0
            ? _globalConfig.defaultCooldownBlocks
            : tokenConfig.cooldownBlocks;
    }

    function setGlobalConfig(GlobalConfig calldata config) external onlyOwner {
        _setGlobalConfig(config);
    }

    function setTokenConfig(address token, TokenConfig calldata config) external onlyOwner {
        if (config.enabled && token != NATIVE_TOKEN && token.code.length == 0) {
            revert InvalidTokenAddress(token);
        }

        tokenConfigs[token] = config;
        emit TokenConfigUpdated(token, config);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function claim(address recipient, address token, uint64 entropyBlockNumber, uint256 nonce)
        external
        nonReentrant
        whenNotPaused
    {
        EffectiveTokenConfig memory effective = getEffectiveTokenConfig(token);
        if (!effective.enabled) {
            revert TokenDisabled(token);
        }

        uint64 nextAllowedBlock = nextClaimBlock[recipient][token];
        if (block.number < nextAllowedBlock) {
            revert ClaimCooldownActive(recipient, token, nextAllowedBlock, block.number);
        }

        bytes32 entropyBlockHash = _validateAndLoadEntropy(entropyBlockNumber);
        bytes32 digest = computeDigest(recipient, token, entropyBlockNumber, entropyBlockHash, nonce);
        if (uint256(digest) > effective.target) {
            revert InvalidProof(digest, effective.target);
        }

        uint256 nextBlock = block.number + uint256(effective.cooldownBlocks);
        if (nextBlock > type(uint64).max) {
            revert BlockNumberOverflow(nextBlock);
        }
        nextClaimBlock[recipient][token] = uint64(nextBlock);

        _payout(recipient, token, effective.amount);

        emit Claimed(recipient, token, effective.amount, entropyBlockNumber, digest);
    }

    function computeDigest(
        address recipient,
        address token,
        uint64 entropyBlockNumber,
        bytes32 entropyBlockHash,
        uint256 nonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                POW_VERSION_HASH,
                block.chainid,
                address(this),
                recipient,
                token,
                entropyBlockNumber,
                entropyBlockHash,
                nonce
            )
        );
    }

    function withdrawNative(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) {
            revert WithdrawFailed(to, amount);
        }
        emit NativeWithdrawn(to, amount);
    }

    function withdrawERC20(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit ERC20Withdrawn(token, to, amount);
    }

    function _setGlobalConfig(GlobalConfig memory config) internal {
        if (
            config.minEntropyAgeBlocks == 0 || config.maxEntropyAgeBlocks <= config.minEntropyAgeBlocks
                || config.maxEntropyAgeBlocks > 255 || config.defaultCooldownBlocks == 0
                || config.nativeTransferGasLimit < 2300 || config.defaultAmount == 0 || config.defaultTarget == 0
        ) {
            revert InvalidGlobalConfig();
        }

        _globalConfig = config;
        emit GlobalConfigUpdated(config);
    }

    function _validateAndLoadEntropy(uint64 entropyBlockNumber) internal view returns (bytes32 entropyBlockHash) {
        if (entropyBlockNumber >= block.number) {
            revert EntropyBlockNotPast(entropyBlockNumber, block.number);
        }

        uint256 age = block.number - uint256(entropyBlockNumber);
        if (age < _globalConfig.minEntropyAgeBlocks) {
            revert EntropyTooRecent(entropyBlockNumber, block.number, _globalConfig.minEntropyAgeBlocks);
        }
        if (age > _globalConfig.maxEntropyAgeBlocks) {
            revert EntropyTooOld(entropyBlockNumber, block.number, _globalConfig.maxEntropyAgeBlocks);
        }

        entropyBlockHash = blockhash(entropyBlockNumber);
        if (entropyBlockHash == bytes32(0)) {
            revert EntropyUnavailable(entropyBlockNumber);
        }
    }

    function _payout(address recipient, address token, uint256 amount) internal {
        if (token == NATIVE_TOKEN) {
            (bool ok,) = payable(recipient).call{value: amount, gas: _globalConfig.nativeTransferGasLimit}("");
            if (!ok) {
                revert NativeTransferFailed(recipient, amount);
            }
            return;
        }

        IERC20(token).safeTransfer(recipient, amount);
    }
}
