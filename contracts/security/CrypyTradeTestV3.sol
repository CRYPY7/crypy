// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/*
 * CRYPY trade test, version 3: Uniswap-v2-style pools (through their router) and Uniswap-v3-style pools (called
 * directly, so every v3 fork works: Uniswap v3, PancakeSwap v3 and others), paired with the wrapped native coin or
 * a stablecoin.
 *
 * NEVER DEPLOYED. CRYPY runs this code only inside a read-only `eth_call`, placing it at a throwaway address with a
 * temporary test balance through the call's "state override". Nothing is signed, sent or stored on any chain.
 *
 * Steps:
 *   0. wrap `amountIn` of the native coin; if the pool is paired with a stablecoin, swap it to that stablecoin first
 *      through a deep v2 pool (`hopRouter`, path wrapped → quote);
 *   1. buy the token with the quote token, comparing what the exchange promised with what actually arrived;
 *   2. transfer 10% of it to a second address (shows a transfer tax or a transfer block);
 *   3. sell the rest back to the quote token, again comparing promised and received amounts.
 * The first step that fails is reported with the contract's own error data.
 *
 * v3 pools: the pool's own swap result is the promised amount. A v3 pool rejects a swap when it receives less than
 * it is owed; when the token takes a fee on the way into the pool, this contract reports how much actually arrived
 * (error SellShort), so the fee is measured instead of guessed.
 *
 * Build: scripts/build-trade-test.mjs (solc 0.8.28, optimizer 200 runs, via IR). The runtime bytecode is stored in
 * src/server/chains/evm/security/trade-test.ts; a unit test checks the two stay in sync.
 */

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
}

interface IWrappedNative {
    function deposit() external payable;
}

interface IUniswapV2RouterMinimal {
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

interface IUniswapV3PoolMinimal {
    function token0() external view returns (address);

    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

contract CrypyTradeTestV3 {
    uint8 internal constant OK = 0;
    uint8 internal constant QUOTE_FAILED = 1;
    uint8 internal constant BUY_FAILED = 2;
    uint8 internal constant BUY_NOTHING = 3;
    uint8 internal constant TRANSFER_FAILED = 4;
    uint8 internal constant APPROVE_FAILED = 5;
    uint8 internal constant SELL_FAILED = 6;
    uint8 internal constant HOP_FAILED = 7;

    uint8 internal constant KIND_V2 = 0;
    uint8 internal constant KIND_V3 = 1;

    uint160 internal constant MIN_SQRT_RATIO_PLUS_ONE = 4295128740;
    uint160 internal constant MAX_SQRT_RATIO_MINUS_ONE = 1461446703485210103287273052203988822378723970341;

    /// A v3 pool was owed `owed` of `token` but received only `received` (the token took a fee on the way in).
    error SellShort(uint256 received, uint256 owed);

    struct Params {
        uint8 kind;
        address router; // v2: the pool's router
        address pool; // v3: the pool
        address token;
        address quote; // what the pool is paired with
        address wrapped; // the chain's wrapped native coin
        address hopRouter; // v2 router for wrapped → quote when quote != wrapped
        uint256 amountIn; // native coin to start with
        address receiver; // second address for the transfer step
    }

    struct Result {
        uint8 failedAt;
        bytes reason;
        uint256 quoteIn;
        uint256 buyExpected;
        uint256 buyReceived;
        uint256 transferSent;
        uint256 transferReceived;
        uint256 sellAmount;
        uint256 sellExpected;
        uint256 sellReceived;
        uint256 sellArrived; // v3: what reached the pool when it rejected the sale (0 otherwise)
    }

    address private activePool;

    receive() external payable {}

    function run(Params calldata p) external returns (Result memory r) {
        // 0. Get the quote token.
        IWrappedNative(p.wrapped).deposit{value: p.amountIn}();
        if (p.quote == p.wrapped) {
            r.quoteIn = p.amountIn;
        } else {
            uint256 before = IERC20Minimal(p.quote).balanceOf(address(this));
            address[] memory hop = new address[](2);
            hop[0] = p.wrapped;
            hop[1] = p.quote;
            if (!_approve(p.wrapped, p.hopRouter)) {
                r.failedAt = HOP_FAILED;
                return r;
            }
            try IUniswapV2RouterMinimal(p.hopRouter).swapExactTokensForTokensSupportingFeeOnTransferTokens(
                p.amountIn, 0, hop, address(this), block.timestamp + 600
            ) {} catch (bytes memory reason) {
                r.failedAt = HOP_FAILED;
                r.reason = reason;
                return r;
            }
            r.quoteIn = IERC20Minimal(p.quote).balanceOf(address(this)) - before;
        }

        // 1. Buy.
        uint256 tokenBefore = IERC20Minimal(p.token).balanceOf(address(this));
        if (p.kind == KIND_V2) {
            address[] memory path = new address[](2);
            path[0] = p.quote;
            path[1] = p.token;
            try IUniswapV2RouterMinimal(p.router).getAmountsOut(r.quoteIn, path) returns (uint256[] memory amounts) {
                r.buyExpected = amounts[1];
            } catch (bytes memory reason) {
                r.failedAt = QUOTE_FAILED;
                r.reason = reason;
                return r;
            }
            if (!_approve(p.quote, p.router)) {
                r.failedAt = BUY_FAILED;
                return r;
            }
            try IUniswapV2RouterMinimal(p.router).swapExactTokensForTokensSupportingFeeOnTransferTokens(
                r.quoteIn, 0, path, address(this), block.timestamp + 600
            ) {} catch (bytes memory reason) {
                r.failedAt = BUY_FAILED;
                r.reason = reason;
                return r;
            }
        } else {
            (bool ok, uint256 out, bytes memory reason) = _swapV3(p.pool, p.quote, r.quoteIn);
            if (!ok) {
                r.failedAt = BUY_FAILED;
                r.reason = reason;
                return r;
            }
            r.buyExpected = out;
        }
        r.buyReceived = IERC20Minimal(p.token).balanceOf(address(this)) - tokenBefore;
        if (r.buyReceived == 0) {
            r.failedAt = BUY_NOTHING;
            return r;
        }

        // 2. Transfer 10% to a second address.
        r.transferSent = r.buyReceived / 10;
        uint256 receiverBefore = IERC20Minimal(p.token).balanceOf(p.receiver);
        (bool sent, bytes memory sentData) =
            p.token.call(abi.encodeWithSelector(0xa9059cbb, p.receiver, r.transferSent));
        if (!sent || (sentData.length > 0 && !abi.decode(sentData, (bool)))) {
            r.failedAt = TRANSFER_FAILED;
            r.reason = sentData;
            return r;
        }
        r.transferReceived = IERC20Minimal(p.token).balanceOf(p.receiver) - receiverBefore;

        // 3. Sell everything left.
        r.sellAmount = IERC20Minimal(p.token).balanceOf(address(this));
        uint256 quoteBefore = IERC20Minimal(p.quote).balanceOf(address(this));
        if (p.kind == KIND_V2) {
            if (!_approve(p.token, p.router)) {
                r.failedAt = APPROVE_FAILED;
                return r;
            }
            address[] memory back = new address[](2);
            back[0] = p.token;
            back[1] = p.quote;
            try IUniswapV2RouterMinimal(p.router).getAmountsOut(r.sellAmount, back) returns (uint256[] memory amounts) {
                r.sellExpected = amounts[1];
            } catch (bytes memory reason) {
                r.failedAt = SELL_FAILED;
                r.reason = reason;
                return r;
            }
            try IUniswapV2RouterMinimal(p.router).swapExactTokensForTokensSupportingFeeOnTransferTokens(
                r.sellAmount, 0, back, address(this), block.timestamp + 600
            ) {} catch (bytes memory reason) {
                r.failedAt = SELL_FAILED;
                r.reason = reason;
                return r;
            }
        } else {
            (bool ok, uint256 out, bytes memory reason) = _swapV3(p.pool, p.token, r.sellAmount);
            if (!ok) {
                r.failedAt = SELL_FAILED;
                r.reason = reason;
                if (reason.length == 68 && bytes4(reason) == SellShort.selector) {
                    (uint256 received,) = abi.decode(_tail(reason), (uint256, uint256));
                    r.sellArrived = received;
                }
                return r;
            }
            r.sellExpected = out;
        }
        r.sellReceived = IERC20Minimal(p.quote).balanceOf(address(this)) - quoteBefore;
        r.failedAt = OK;
    }

    /// Exact-input swap of `amountIn` of `tokenIn` on a v3 pool; returns what the pool says it paid out.
    function _swapV3(address pool, address tokenIn, uint256 amountIn)
        internal
        returns (bool ok, uint256 out, bytes memory reason)
    {
        bool zeroForOne = IUniswapV3PoolMinimal(pool).token0() == tokenIn;
        activePool = pool;
        try IUniswapV3PoolMinimal(pool).swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            zeroForOne ? MIN_SQRT_RATIO_PLUS_ONE : MAX_SQRT_RATIO_MINUS_ONE,
            abi.encode(tokenIn)
        ) returns (int256 amount0, int256 amount1) {
            int256 paid = zeroForOne ? amount1 : amount0;
            ok = true;
            out = paid < 0 ? uint256(-paid) : 0;
        } catch (bytes memory why) {
            reason = why;
        }
        activePool = address(0);
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        _pay(amount0Delta, amount1Delta, data);
    }

    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        _pay(amount0Delta, amount1Delta, data);
    }

    function _pay(int256 amount0Delta, int256 amount1Delta, bytes calldata data) internal {
        require(msg.sender == activePool, "not the pool");
        address tokenIn = abi.decode(data, (address));
        uint256 owed = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);
        uint256 before = IERC20Minimal(tokenIn).balanceOf(msg.sender);
        (bool sent, bytes memory sentData) = tokenIn.call(abi.encodeWithSelector(0xa9059cbb, msg.sender, owed));
        require(sent && (sentData.length == 0 || abi.decode(sentData, (bool))), "pay failed");
        uint256 arrived = IERC20Minimal(tokenIn).balanceOf(msg.sender) - before;
        if (arrived < owed) revert SellShort(arrived, owed);
    }

    function _approve(address token, address spender) internal returns (bool) {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0x095ea7b3, spender, type(uint256).max));
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }

    function _tail(bytes memory data) internal pure returns (bytes memory out) {
        out = new bytes(data.length - 4);
        for (uint256 i = 0; i < out.length; i++) out[i] = data[i + 4];
    }
}
